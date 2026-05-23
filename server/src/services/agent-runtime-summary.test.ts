import { describe, expect, it } from "vitest";
import { buildAgentRuntimeSummary } from "./agent-runtime-summary.js";

const baseAgent = {
  id: "11111111-1111-4111-8111-111111111111",
  companyId: "22222222-2222-4222-8222-222222222222",
  name: "Builder",
  urlKey: "builder",
  role: "engineer",
  title: "Builder",
  icon: null,
  status: "idle",
  reportsTo: null,
  capabilities: null,
  adapterType: "process",
  adapterConfig: {},
  runtimeConfig: {},
  budgetMonthlyCents: 0,
  spentMonthlyCents: 0,
  pauseReason: null,
  pausedAt: null,
  permissions: { canCreateAgents: false },
  lastHeartbeatAt: null,
  metadata: null,
  createdAt: new Date("2026-03-19T00:00:00.000Z"),
  updatedAt: new Date("2026-03-19T00:00:00.000Z"),
} as const;

describe("agent runtime summary", () => {
  it("returns none when an agent has no Hermes profile runtime binding", () => {
    expect(buildAgentRuntimeSummary(baseAgent)).toEqual({
      kind: "none",
      lastReflectionAt: null,
      recentSkillChanges: [],
      warnings: ["No Hermes profile runtime binding is configured for this agent."],
    });
  });

  it("returns safe Hermes profile runtime metadata without raw paths", () => {
    const summary = buildAgentRuntimeSummary({
      ...baseAgent,
      runtimeConfig: {
        hermesProfile: {
          kind: "hermes_profile",
          profileName: "builder-runtime",
          hermesHomePath: "/Users/operator/.hermes/profiles/builder-runtime",
          workspacePath: "/Users/operator/workspaces/builder-runtime",
          memoryPolicy: "summary_visible",
          skillPolicy: "managed",
          selfImprovementPolicy: "proposal_only",
          visibilityPolicy: "summary_only",
        },
      },
    });

    expect(summary).toEqual({
      kind: "hermes_profile",
      profileName: "builder-runtime",
      memoryPolicy: "summary_visible",
      skillPolicy: "managed",
      selfImprovementPolicy: "proposal_only",
      visibilityPolicy: "summary_only",
      lastReflectionAt: null,
      recentSkillChanges: [],
      warnings: [],
    });
    expect(JSON.stringify(summary)).not.toContain("/Users/operator");
  });
});
