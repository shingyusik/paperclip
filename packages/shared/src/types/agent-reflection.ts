export type AgentReflectionStatus = "recorded" | "proposed" | "approved" | "rejected" | "applied";

export type AgentReflectionProposal = Record<string, unknown>;

export interface AgentReflection {
  id: string;
  companyId: string;
  agentId: string;
  issueId: string | null;
  runId: string | null;
  summary: string;
  learned: string;
  proposedMemoryUpdates: AgentReflectionProposal[];
  proposedSkillUpdates: AgentReflectionProposal[];
  sharedChangeProposals: AgentReflectionProposal[];
  status: AgentReflectionStatus;
  createdAt: Date;
  updatedAt: Date;
}
