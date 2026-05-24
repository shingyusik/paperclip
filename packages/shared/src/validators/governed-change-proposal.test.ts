import { describe, expect, it } from "vitest";
import * as shared from "../index.js";
import {
  createGovernedChangeProposalSchema,
  governedChangeTypeSchema,
} from "./index.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const agentId = "22222222-2222-4222-8222-222222222222";

describe("governed change proposal validators", () => {
  it("accepts a valid issue-backed proposal request and trims text fields", () => {
    const parsed = createGovernedChangeProposalSchema.parse({
      changeType: "roadmap_change",
      title: "  Adjust launch roadmap  ",
      summary: "  Move beta behind onboarding polish.  ",
      rationale: "  Reduces rollout risk.  ",
      target: { projectId },
      proposedByUserId: "  board-user  ",
      proposalPayload: { roadmapItems: ["Onboarding polish", "Beta"] },
      idempotencyKey: "  roadmap-beta-sequence  ",
    });

    expect(parsed).toMatchObject({
      changeType: "roadmap_change",
      title: "Adjust launch roadmap",
      summary: "Move beta behind onboarding polish.",
      rationale: "Reduces rollout risk.",
      target: { projectId },
      proposedByUserId: "board-user",
      proposalPayload: { roadmapItems: ["Onboarding polish", "Beta"] },
      idempotencyKey: "roadmap-beta-sequence",
    });
  });

  it("exports the governed change validators from the shared root", () => {
    expect(shared.createGovernedChangeProposalSchema).toBe(createGovernedChangeProposalSchema);
    expect(shared.governedChangeTypeSchema).toBe(governedChangeTypeSchema);
  });

  it("requires exactly one proposer", () => {
    const base = {
      changeType: "shared_project_rule_change",
      title: "Update PR policy",
      summary: "Require smoke checks before handoff.",
      scope: "project",
      proposalPayload: { rule: "Run smoke checks" },
    };

    expect(createGovernedChangeProposalSchema.safeParse(base).success).toBe(false);
    expect(createGovernedChangeProposalSchema.safeParse({
      ...base,
      proposedByUserId: "board-user",
      proposedByAgentId: agentId,
    }).success).toBe(false);
  });

  it("requires a target or explicit scope", () => {
    const result = createGovernedChangeProposalSchema.safeParse({
      changeType: "organization_skill_template_change",
      title: "Update skill template",
      summary: "Add verification section.",
      target: {},
      proposedByUserId: "board-user",
      proposalPayload: { template: "verification" },
    });

    expect(result.success).toBe(false);
  });

  it("rejects empty proposal payloads and unknown change types", () => {
    const base = {
      title: "Update reporting line",
      summary: "Move QA under CTO.",
      target: { agentId },
      proposedByUserId: "board-user",
    };

    expect(createGovernedChangeProposalSchema.safeParse({
      ...base,
      changeType: "agent_role_reporting_change",
      proposalPayload: {},
    }).success).toBe(false);
    expect(createGovernedChangeProposalSchema.safeParse({
      ...base,
      changeType: "private_memory_change",
      proposalPayload: { reportsTo: "cto" },
    }).success).toBe(false);
  });
});
