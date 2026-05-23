import { describe, expect, it } from "vitest";
import * as validators from "./index.js";

describe("agent reflection validators", () => {
  it("accepts a minimal reflection and defaults proposal collections", () => {
    expect(
      validators.createAgentReflectionSchema,
      "createAgentReflectionSchema should be exported from validators",
    ).toBeDefined();

    const parsed = validators.createAgentReflectionSchema.parse({
      companyId: "11111111-1111-4111-8111-111111111111",
      agentId: "22222222-2222-4222-8222-222222222222",
      summary: "The run identified a repeatable deploy check.",
      learned: "Always inspect the release checklist before publishing.",
    });

    expect(parsed).toEqual({
      companyId: "11111111-1111-4111-8111-111111111111",
      agentId: "22222222-2222-4222-8222-222222222222",
      issueId: null,
      runId: null,
      summary: "The run identified a repeatable deploy check.",
      learned: "Always inspect the release checklist before publishing.",
      proposedMemoryUpdates: [],
      proposedSkillUpdates: [],
      sharedChangeProposals: [],
      status: "recorded",
    });
  });

  it("accepts all supported lifecycle statuses and rejects unknown statuses", () => {
    expect(
      validators.agentReflectionStatusSchema,
      "agentReflectionStatusSchema should be exported from validators",
    ).toBeDefined();

    expect([
      "recorded",
      "proposed",
      "approved",
      "rejected",
      "applied",
    ].map((status) => validators.agentReflectionStatusSchema.parse(status))).toEqual([
      "recorded",
      "proposed",
      "approved",
      "rejected",
      "applied",
    ]);

    expect(() => validators.agentReflectionStatusSchema.parse("published")).toThrow();
  });

  it("keeps optional issue and run links nullable", () => {
    expect(
      validators.createAgentReflectionSchema,
      "createAgentReflectionSchema should be exported from validators",
    ).toBeDefined();

    const parsed = validators.createAgentReflectionSchema.parse({
      companyId: "11111111-1111-4111-8111-111111111111",
      agentId: "22222222-2222-4222-8222-222222222222",
      issueId: "33333333-3333-4333-8333-333333333333",
      runId: "44444444-4444-4444-8444-444444444444",
      summary: "Reflection attached to a completed issue run.",
      learned: "Capture follow-up proposals without editing private memory.",
      proposedMemoryUpdates: [{ action: "append", summary: "Remember the deploy check." }],
      proposedSkillUpdates: [{ name: "release", action: "revise" }],
      sharedChangeProposals: [{ kind: "issue", title: "Update release docs" }],
      status: "proposed",
    });

    expect(parsed.issueId).toBe("33333333-3333-4333-8333-333333333333");
    expect(parsed.runId).toBe("44444444-4444-4444-8444-444444444444");
  });
});
