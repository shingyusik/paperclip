import { describe, expect, it } from "vitest";
import {
  HERMES_PROFILE_TASK_PROMPT_CONTEXT_KEY,
  attachHermesProfileTaskPrompt,
  buildHermesProfileTaskPrompt,
} from "../services/hermes-profile-context.js";

describe("Hermes profile task prompt builder", () => {
  it("orders Paperclip context from identity through acceptance criteria", () => {
    const prompt = buildHermesProfileTaskPrompt({
      agent: {
        name: "Builder",
        role: "Engineer",
        reportingLine: "Reports to Lead",
        runtimeSummary: "Private memory summary only.",
      },
      companyMission: "Build reliable software.",
      projectRoadmap: "Roadmap excerpt.",
      projectSpec: "Spec decisions.",
      milestoneContext: "Milestone M1.",
      taskContext: "Task T1.",
      issuePlan: "Plan document.",
      meetingContext: "Meeting notes.",
      acceptanceCriteria: ["Tests pass", "No raw memory exposure"],
    });

    const orderedHeadings = [
      "## Agent Identity",
      "## Private Runtime Summary",
      "## Company Mission",
      "## Project Roadmap",
      "## Project Spec / Decisions",
      "## Current Milestone",
      "## Current Task",
      "## Current Issue Plan",
      "## Meeting Room Context",
      "## Acceptance Criteria",
      "## Operating Rules",
    ];
    const positions = orderedHeadings.map((heading) => prompt.indexOf(heading));

    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(prompt).toContain("- Tests pass");
    expect(prompt).toContain("Do not reveal raw private Hermes memory");
  });

  it("omits empty optional sections and keeps acceptance criteria strings", () => {
    const prompt = buildHermesProfileTaskPrompt({
      agent: { name: "Operator" },
      companyMission: "",
      acceptanceCriteria: "Ship a minimal boundary.",
    });

    expect(prompt).toContain("## Agent Identity\nName: Operator");
    expect(prompt).not.toContain("## Company Mission");
    expect(prompt).toContain("## Acceptance Criteria\nShip a minimal boundary.");
  });

  it("truncates long sections and redacts obvious secrets", () => {
    const prompt = buildHermesProfileTaskPrompt({
      agent: { name: "Operator" },
      issuePlan: `Use {"apiKey":"sk-secret-value"}. ${"x".repeat(80)}`,
      maxSectionChars: 60,
    });

    expect(prompt).toContain("***REDACTED***");
    expect(prompt).not.toContain("sk-secret-value");
    expect(prompt).toContain("...[truncated");
  });

  it("attaches the generated prompt to heartbeat context for adapter invocation", () => {
    const context: Record<string, unknown> = {
      paperclipTaskMarkdown: "Task markdown from heartbeat.",
      paperclipContinuationSummary: { body: "Continue after prior implementation." },
    };

    attachHermesProfileTaskPrompt(context, {
      agent: { name: "Builder", role: "engineer", runtimeSummary: "Private summary." },
      taskContext: "Task markdown from heartbeat.",
      issuePlan: "Plan body.",
      acceptanceCriteria: ["Tests pass"],
    });

    expect(context[HERMES_PROFILE_TASK_PROMPT_CONTEXT_KEY]).toContain("## Agent Identity");
    expect(context[HERMES_PROFILE_TASK_PROMPT_CONTEXT_KEY]).toContain("## Current Task\nTask markdown from heartbeat.");
    expect(context[HERMES_PROFILE_TASK_PROMPT_CONTEXT_KEY]).toContain("## Current Issue Plan\nPlan body.");
    expect(context[HERMES_PROFILE_TASK_PROMPT_CONTEXT_KEY]).toContain("- Tests pass");
  });
});
