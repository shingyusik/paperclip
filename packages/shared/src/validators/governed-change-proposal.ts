import { z } from "zod";
import {
  GOVERNED_CHANGE_PROPOSAL_SCOPES,
  GOVERNED_CHANGE_TYPES,
} from "../constants.js";

export const governedChangeTypeSchema = z.enum(GOVERNED_CHANGE_TYPES);

export const governedChangeProposalScopeSchema = z.enum(GOVERNED_CHANGE_PROPOSAL_SCOPES);

export const governedChangeProposalTargetSchema = z.object({
  projectId: z.string().uuid().optional(),
  issueId: z.string().uuid().optional(),
  projectDocumentId: z.string().uuid().optional(),
  agentId: z.string().uuid().optional(),
  meetingRoomId: z.string().uuid().optional(),
  meetingSummaryId: z.string().uuid().optional(),
}).strict();

export const createGovernedChangeProposalSchema = z.object({
  changeType: governedChangeTypeSchema,
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  rationale: z.string().trim().min(1).optional(),
  scope: governedChangeProposalScopeSchema.optional(),
  target: governedChangeProposalTargetSchema.optional().default({}),
  proposedByUserId: z.string().trim().min(1).optional(),
  proposedByAgentId: z.string().uuid().optional(),
  proposalPayload: z.record(z.string(), z.unknown()).refine(
    (value) => Object.keys(value).length > 0,
    "proposalPayload must not be empty",
  ),
  idempotencyKey: z.string().trim().min(1).optional(),
}).superRefine((value, ctx) => {
  const proposerCount = Number(Boolean(value.proposedByUserId)) + Number(Boolean(value.proposedByAgentId));
  if (proposerCount !== 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Exactly one proposer is required",
      path: ["proposedByUserId"],
    });
  }

  const targetCount = Object.values(value.target ?? {}).filter(Boolean).length;
  if (targetCount === 0 && !value.scope) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "A target or explicit scope is required",
      path: ["target"],
    });
  }
});

export type CreateGovernedChangeProposal = z.infer<typeof createGovernedChangeProposalSchema>;
