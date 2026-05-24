import { createHash } from "node:crypto";
import { and, eq, isNull, notInArray, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  agents,
  approvals,
  issues,
  meetingRooms,
  meetingSummaries,
  projectDocuments,
  projects,
} from "@paperclipai/db";
import type { CreateGovernedChangeProposal } from "@paperclipai/shared";
import { unprocessable } from "../errors.js";
import { issueService } from "./issues.js";
import { approvalService } from "./approvals.js";
import { logActivity } from "./activity-log.js";

const GOVERNED_CHANGE_ORIGIN_KIND = "governed_change_proposal";
const GOVERNED_CHANGE_APPROVAL_TYPE = "governed_change";
const OPEN_ISSUE_STATUSES = ["backlog", "todo", "in_progress", "in_review", "blocked"];

type ProposalActor = {
  actorType: "agent" | "user";
  actorId: string;
  agentId?: string | null;
  runId?: string | null;
};

type GovernedProposalTarget = CreateGovernedChangeProposal["target"];

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

function deriveOriginId(input: CreateGovernedChangeProposal) {
  if (input.idempotencyKey) {
    return `idempotency:${input.idempotencyKey}`;
  }
  const fingerprint = createHash("sha256")
    .update(sortedJson({
      changeType: input.changeType,
      scope: input.scope ?? null,
      target: input.target ?? {},
      proposalPayload: input.proposalPayload,
    }))
    .digest("hex")
    .slice(0, 32);
  return `derived:${input.changeType}:${fingerprint}`;
}

function buildIssueDescription(input: CreateGovernedChangeProposal) {
  const sections = [
    `Summary:\n${input.summary}`,
    input.rationale ? `Rationale:\n${input.rationale}` : null,
    `Governed change type:\n${input.changeType}`,
    input.scope ? `Scope:\n${input.scope}` : null,
    `Target:\n${JSON.stringify(input.target ?? {}, null, 2)}`,
    `Proposal payload:\n${JSON.stringify(input.proposalPayload, null, 2)}`,
    "Canonical changes must not be applied until the linked governed_change approval is approved.",
  ];
  return sections.filter((section): section is string => Boolean(section)).join("\n\n");
}

async function assertRowBelongsToCompany(
  db: Db,
  table: typeof projects | typeof issues | typeof agents | typeof meetingRooms | typeof meetingSummaries | typeof projectDocuments,
  id: string,
  companyId: string,
  label: string,
) {
  const row = await db
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.id, id), eq(table.companyId, companyId)))
    .then((rows) => rows[0] ?? null);
  if (!row) {
    throw unprocessable(`${label} target does not belong to this company`);
  }
}

export function governedChangeProposalService(db: Db) {
  const issuesSvc = issueService(db);
  const approvalsSvc = approvalService(db);

  async function assertTargetCompanyScope(companyId: string, target: GovernedProposalTarget) {
    if (!target) return;
    if (target.projectId) {
      await assertRowBelongsToCompany(db, projects, target.projectId, companyId, "Project");
    }
    if (target.issueId) {
      await assertRowBelongsToCompany(db, issues, target.issueId, companyId, "Issue");
    }
    if (target.agentId) {
      await assertRowBelongsToCompany(db, agents, target.agentId, companyId, "Agent");
    }
    if (target.meetingRoomId) {
      await assertRowBelongsToCompany(db, meetingRooms, target.meetingRoomId, companyId, "Meeting room");
    }
    if (target.meetingSummaryId) {
      await assertRowBelongsToCompany(db, meetingSummaries, target.meetingSummaryId, companyId, "Meeting summary");
    }
    if (target.projectDocumentId) {
      await assertRowBelongsToCompany(db, projectDocuments, target.projectDocumentId, companyId, "Project document");
    }
  }

  async function findOpenIssue(companyId: string, originId: string) {
    return db
      .select()
      .from(issues)
      .where(and(
        eq(issues.companyId, companyId),
        eq(issues.originKind, GOVERNED_CHANGE_ORIGIN_KIND),
        eq(issues.originId, originId),
        isNull(issues.hiddenAt),
        notInArray(issues.status, ["done", "cancelled"]),
      ))
      .then((rows) => rows[0] ?? null);
  }

  async function findPendingApproval(companyId: string, issueId: string) {
    return db
      .select()
      .from(approvals)
      .where(and(
        eq(approvals.companyId, companyId),
        eq(approvals.type, GOVERNED_CHANGE_APPROVAL_TYPE),
        eq(approvals.status, "pending"),
        sql`${approvals.payload}->>'issueId' = ${issueId}`,
      ))
      .then((rows) => rows[0] ?? null);
  }

  async function createPendingApproval(
    companyId: string,
    input: CreateGovernedChangeProposal,
    issueId: string,
  ) {
    return approvalsSvc.create(companyId, {
      type: GOVERNED_CHANGE_APPROVAL_TYPE,
      requestedByAgentId: input.proposedByAgentId ?? null,
      requestedByUserId: input.proposedByUserId ?? null,
      status: "pending",
      payload: {
        issueId,
        changeType: input.changeType,
        scope: input.scope ?? null,
        target: input.target ?? {},
        proposalPayload: input.proposalPayload,
        summary: input.summary,
        rationale: input.rationale ?? null,
        canonicalSideEffects: false,
      },
      decisionNote: null,
      decidedByUserId: null,
      decidedAt: null,
      updatedAt: new Date(),
    });
  }

  return {
    create: async (
      companyId: string,
      input: CreateGovernedChangeProposal,
      actor: ProposalActor,
    ) => {
      if (input.proposedByAgentId) {
        await assertRowBelongsToCompany(db, agents, input.proposedByAgentId, companyId, "Proposer agent");
      }
      await assertTargetCompanyScope(companyId, input.target);

      const originId = deriveOriginId(input);
      const existingIssue = await findOpenIssue(companyId, originId);
      if (existingIssue) {
        const existingApproval = await findPendingApproval(companyId, existingIssue.id);
        const approval = existingApproval ?? await createPendingApproval(companyId, input, existingIssue.id);
        return { issue: existingIssue, approval, created: false };
      }

      const issue = await issuesSvc.create(companyId, {
        title: input.title,
        description: buildIssueDescription(input),
        status: "backlog",
        priority: "medium",
        projectId: input.target?.projectId ?? null,
        createdByAgentId: input.proposedByAgentId ?? null,
        createdByUserId: input.proposedByUserId ?? null,
        originKind: GOVERNED_CHANGE_ORIGIN_KIND,
        originId,
        originFingerprint: input.changeType,
      });
      const approval = await createPendingApproval(companyId, input, issue.id);

      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId ?? null,
        runId: actor.runId ?? null,
        action: "governed_change_proposal.created",
        entityType: "issue",
        entityId: issue.id,
        details: {
          approvalId: approval.id,
          changeType: input.changeType,
          originId,
          target: input.target ?? {},
          scope: input.scope ?? null,
        },
      });

      return { issue, approval, created: true };
    },
  };
}

export const governedChangeProposalConstants = {
  approvalType: GOVERNED_CHANGE_APPROVAL_TYPE,
  originKind: GOVERNED_CHANGE_ORIGIN_KIND,
  openIssueStatuses: OPEN_ISSUE_STATUSES,
} as const;
