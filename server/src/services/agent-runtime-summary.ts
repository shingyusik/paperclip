import type { Agent, AgentRuntimeConfig, AgentRuntimeSummary } from "@paperclipai/shared";
import { readHermesProfileRuntimeBinding } from "@paperclipai/shared";
import type { Db } from "@paperclipai/db";

type AgentRuntimeSummarySource = Pick<Agent, "runtimeConfig"> | { runtimeConfig: AgentRuntimeConfig | Record<string, unknown> | null | undefined };

export function buildAgentRuntimeSummary(agent: AgentRuntimeSummarySource): AgentRuntimeSummary {
  const binding = readHermesProfileRuntimeBinding(agent.runtimeConfig);
  if (!binding) {
    return {
      kind: "none",
      lastReflectionAt: null,
      recentSkillChanges: [],
      warnings: ["No Hermes profile runtime binding is configured for this agent."],
    };
  }

  return {
    kind: "hermes_profile",
    profileName: binding.profileName,
    memoryPolicy: binding.memoryPolicy,
    skillPolicy: binding.skillPolicy,
    selfImprovementPolicy: binding.selfImprovementPolicy,
    visibilityPolicy: binding.visibilityPolicy,
    lastReflectionAt: null,
    recentSkillChanges: [],
    warnings: [],
  };
}

export function agentRuntimeSummaryService(_db: Db) {
  return {
    buildForAgent(agent: AgentRuntimeSummarySource): AgentRuntimeSummary {
      return buildAgentRuntimeSummary(agent);
    },
  };
}
