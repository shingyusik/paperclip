import { z } from "zod";

export const agentReflectionStatusSchema = z.enum([
  "recorded",
  "proposed",
  "approved",
  "rejected",
  "applied",
]);

const agentReflectionProposalSchema = z.record(z.string(), z.unknown());
const optionalUuidLinkSchema = z.string().uuid().nullable().optional().default(null);

export const createAgentReflectionSchema = z.object({
  companyId: z.string().uuid(),
  agentId: z.string().uuid(),
  issueId: optionalUuidLinkSchema,
  runId: optionalUuidLinkSchema,
  summary: z.string().trim().min(1),
  learned: z.string().trim().min(1),
  proposedMemoryUpdates: z.array(agentReflectionProposalSchema).optional().default([]),
  proposedSkillUpdates: z.array(agentReflectionProposalSchema).optional().default([]),
  sharedChangeProposals: z.array(agentReflectionProposalSchema).optional().default([]),
  status: agentReflectionStatusSchema.optional().default("recorded"),
});

export type AgentReflectionStatus = z.infer<typeof agentReflectionStatusSchema>;
export type CreateAgentReflection = z.infer<typeof createAgentReflectionSchema>;
