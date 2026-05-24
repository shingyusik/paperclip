import type {
  GovernedChangeProposalScope,
  GovernedChangeType,
} from "../constants.js";

export type { GovernedChangeProposalScope, GovernedChangeType };

export interface GovernedChangeProposalTarget {
  projectId?: string;
  issueId?: string;
  projectDocumentId?: string;
  agentId?: string;
  meetingRoomId?: string;
  meetingSummaryId?: string;
}

export interface CreateGovernedChangeProposalRequest {
  changeType: GovernedChangeType;
  title: string;
  summary: string;
  rationale?: string;
  scope?: GovernedChangeProposalScope;
  target?: GovernedChangeProposalTarget;
  proposedByUserId?: string;
  proposedByAgentId?: string;
  proposalPayload: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface AcceptGovernedChangeApplicationRequest {
  issueId: string;
  changeType: GovernedChangeType;
  scope?: GovernedChangeProposalScope;
  target?: GovernedChangeProposalTarget;
}
