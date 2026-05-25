import type { Db } from "@paperclipai/db";
import { activityLog, projects } from "@paperclipai/db";
import type {
  GovernedChangeProposalScope,
  GovernedChangeProposalTarget,
  GovernedChangeType,
} from "@paperclipai/shared";
import { PROJECT_STATUSES } from "@paperclipai/shared";
import { and, eq } from "drizzle-orm";
import { unprocessable } from "../errors.js";
import { logActivity } from "./activity-log.js";
import { governedChangeApprovalGateService } from "./governed-change-approval-gate.js";

export type GovernedChangeApplicationInput = {
  issueId: string;
  changeType: GovernedChangeType;
  target?: GovernedChangeProposalTarget;
  scope?: GovernedChangeProposalScope;
};

export type GovernedChangeApplicationActor = {
  actorType: "agent" | "user" | "system" | "plugin";
  actorId: string;
  agentId?: string | null;
  runId?: string | null;
};

type SafeProjectPatch = Partial<Pick<
  typeof projects.$inferInsert,
  "name" | "description" | "status" | "targetDate" | "color"
>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function buildSafeProjectPatch(projectPatch: unknown): SafeProjectPatch {
  if (!isRecord(projectPatch)) {
    return {};
  }

  const patch: SafeProjectPatch = {};
  if (typeof projectPatch.name === "string") {
    patch.name = projectPatch.name;
  }
  if (typeof projectPatch.description === "string" || projectPatch.description === null) {
    patch.description = projectPatch.description;
  }
  if (
    typeof projectPatch.status === "string" &&
    (PROJECT_STATUSES as readonly string[]).includes(projectPatch.status)
  ) {
    patch.status = projectPatch.status;
  }
  if (typeof projectPatch.targetDate === "string" || projectPatch.targetDate === null) {
    patch.targetDate = projectPatch.targetDate;
  }
  if (typeof projectPatch.color === "string" || projectPatch.color === null) {
    patch.color = projectPatch.color;
  }

  return patch;
}

function hasPatchEntries(projectPatch: SafeProjectPatch) {
  return Object.keys(projectPatch).length > 0;
}

function sortedJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(sortedJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${sortedJson(entryValue)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function detailsMatchApplication(
  details: Record<string, unknown> | null | undefined,
  input: {
    approvalId: string;
    issueId: string;
    changeType: GovernedChangeType;
    scope: GovernedChangeProposalScope | null;
    target: GovernedChangeProposalTarget;
  },
) {
  if (!details) return false;
  return (
    details.approvalId === input.approvalId &&
    details.issueId === input.issueId &&
    details.changeType === input.changeType &&
    details.scope === input.scope &&
    sortedJson(details.target ?? {}) === sortedJson(input.target) &&
    details.canonicalSideEffects === true
  );
}

export function governedChangeApplicationService(db: Db) {
  const approvalGate = governedChangeApprovalGateService(db);

  async function acceptApprovedApplication(
    companyId: string,
    input: GovernedChangeApplicationInput,
    actor: GovernedChangeApplicationActor,
  ) {
    const { issue, approval } = await approvalGate.assertApproved(companyId, input);
    let canonicalSideEffects = false;
    let appliedProjectPatch: SafeProjectPatch | null = null;
    let alreadyApplied = false;
    let previousActivityId: string | null = null;

    if (
      input.changeType === "roadmap_change" &&
      input.scope === "project" &&
      input.target?.projectId
    ) {
      const proposalPayload = isRecord(approval.payload.proposalPayload)
        ? approval.payload.proposalPayload
        : {};
      const projectPatch = buildSafeProjectPatch(proposalPayload.projectPatch);

      if (hasPatchEntries(projectPatch)) {
        const previousApplicationActivity = await db
          .select({ id: activityLog.id, details: activityLog.details })
          .from(activityLog)
          .where(and(
            eq(activityLog.companyId, companyId),
            eq(activityLog.action, "governed_change_application.accepted"),
            eq(activityLog.entityType, "issue"),
            eq(activityLog.entityId, issue.id),
          ))
          .then((rows) => {
            return rows.find((row) => detailsMatchApplication(row.details, {
              approvalId: approval.id,
              issueId: issue.id,
              changeType: input.changeType,
              scope: input.scope ?? null,
              target: input.target ?? {},
            })) ?? null;
          });

        if (previousApplicationActivity) {
          alreadyApplied = true;
          previousActivityId = previousApplicationActivity.id;
        } else {
          const project = await db
            .select({ id: projects.id })
            .from(projects)
            .where(and(eq(projects.companyId, companyId), eq(projects.id, input.target.projectId)))
            .then((rows) => rows[0] ?? null);
          if (!project) {
            throw unprocessable("Project target does not belong to this company");
          }

          const updatedProject = await db
            .update(projects)
            .set({ ...projectPatch, updatedAt: new Date() })
            .where(and(eq(projects.companyId, companyId), eq(projects.id, input.target.projectId)))
            .returning({ id: projects.id })
            .then((rows) => rows[0] ?? null);

          if (updatedProject) {
            canonicalSideEffects = true;
            appliedProjectPatch = projectPatch;
          }
        }
      }
    }

    const activity = await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId ?? null,
      runId: actor.runId ?? null,
      action: "governed_change_application.accepted",
      entityType: "issue",
      entityId: issue.id,
      details: {
        approvalId: approval.id,
        issueId: issue.id,
        changeType: input.changeType,
        scope: input.scope ?? null,
        target: input.target ?? {},
        dryRun: !canonicalSideEffects,
        canonicalSideEffects,
        ...(alreadyApplied ? { alreadyApplied, previousActivityId } : {}),
        ...(appliedProjectPatch ? { appliedProjectPatch } : {}),
      },
    });

    return {
      issue,
      approval,
      activity,
      canonicalSideEffects,
    };
  }

  return {
    acceptApprovedApplication,
    prepareApplication: acceptApprovedApplication,
  };
}
