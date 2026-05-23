// @vitest-environment jsdom

import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { AgentRuntimeSummary } from "@paperclipai/shared";
import {
  AGENT_DETAIL_TABS,
  AgentRuntimeGrowthPanel,
  parseAgentDetailView,
} from "./agent-detail-runtime-growth";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const hermesSummary: AgentRuntimeSummary = {
  kind: "hermes_profile",
  profileName: "builder-runtime",
  memoryPolicy: "summary_visible",
  skillPolicy: "managed",
  selfImprovementPolicy: "proposal_only",
  visibilityPolicy: "summary_only",
  lastReflectionAt: null,
  recentSkillChanges: [],
  warnings: [],
};

describe("AgentDetail runtime growth tabs", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot> | null;

  afterEach(async () => {
    if (root) {
      await act(async () => root!.unmount());
    }
    container?.remove();
    root = null;
  });

  it("defines the growth-oriented agent detail tab set", () => {
    expect(AGENT_DETAIL_TABS.map((tab) => tab.label)).toEqual([
      "Overview",
      "Current Work",
      "Memory",
      "Skills",
      "Meetings",
      "Reflections",
      "Improvements",
      "Settings",
      "Instructions",
      "Budget",
    ]);
    expect(parseAgentDetailView("overview")).toBe("dashboard");
    expect(parseAgentDetailView("current-work")).toBe("runs");
    expect(parseAgentDetailView("settings")).toBe("configuration");
    expect(parseAgentDetailView("memory")).toBe("memory");
  });

  it("renders safe Hermes runtime metadata and empty-state guidance", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <AgentRuntimeGrowthPanel
          view="memory"
          summary={hermesSummary}
          isLoading={false}
          error={null}
        />,
      );
    });

    expect(container.textContent).toContain("builder-runtime");
    expect(container.textContent).toContain("summary_visible");
    expect(container.textContent).toContain("Memory remains private by default");
    expect(container.textContent).not.toContain("/Users/operator");
  });
});
