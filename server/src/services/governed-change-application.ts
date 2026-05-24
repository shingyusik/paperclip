import type { Db } from "@paperclipai/db";
import type {
  GovernedChangeProposalScope,
  GovernedChangeProposalTarget,
  GovernedChangeType,
} from "@paperclipai/shared";
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

export function governedChangeApplicationService(db: Db) {
  const approvalGate = governedChangeApprovalGateService(db);

  async function acceptApprovedApplication(
    companyId: string,
    input: GovernedChangeApplicationInput,
    actor: GovernedChangeApplicationActor,
  ) {
    const { issue, approval } = await approvalGate.assertApproved(companyId, input);

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
        dryRun: true,
        canonicalSideEffects: false,
      },
    });

    return {
      issue,
      approval,
      activity,
      canonicalSideEffects: false,
    };
  }

  return {
    acceptApprovedApplication,
    prepareApplication: acceptApprovedApplication,
  };
}
