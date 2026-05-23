import { describe, expect, it, vi } from "vitest";
import {
  buildHermesRunReflectionPrompt,
  maybeRecordAgentRunReflection,
  readStructuredRunReflectionFromResultJson,
  shouldReflectAfterRun,
} from "./agent-reflections.js";

const companyId = "22222222-2222-4222-8222-222222222222";
const agentId = "11111111-1111-4111-8111-111111111111";
const runId = "33333333-3333-4333-8333-333333333333";
const issueId = "44444444-4444-4444-8444-444444444444";

const hermesAgent = {
  id: agentId,
  companyId,
  name: "Builder",
  runtimeConfig: {
    hermesProfile: {
      kind: "hermes_profile",
      profileName: "builder-runtime",
      selfImprovementPolicy: "proposal_only",
    },
  },
};

const successfulRun = {
  id: runId,
  companyId,
  agentId,
  status: "succeeded",
  contextSnapshot: { issueId },
  resultJson: { summary: "Implemented the requested change and verified tests." },
  stdoutExcerpt: "all tests passed",
  stderrExcerpt: null,
};

function fakeDb() {
  const inserted: unknown[] = [];
  return {
    inserted,
    insert: vi.fn(() => ({
      values: vi.fn((value: unknown) => {
        inserted.push(value);
        return {
          returning: vi.fn(async () => [{ id: "55555555-5555-4555-8555-555555555555", ...(value as object) }]),
        };
      }),
    })),
  };
}

describe("agent reflection trigger", () => {
  it("reflects only for succeeded Hermes-profile runs when self-improvement is enabled", () => {
    expect(shouldReflectAfterRun({ agent: hermesAgent, run: successfulRun })).toBe(true);

    expect(
      shouldReflectAfterRun({
        agent: {
          ...hermesAgent,
          runtimeConfig: {
            hermesProfile: {
              kind: "hermes_profile",
              profileName: "builder-runtime",
              selfImprovementPolicy: "disabled",
            },
          },
        },
        run: successfulRun,
      }),
    ).toBe(false);

    expect(
      shouldReflectAfterRun({
        agent: { ...hermesAgent, runtimeConfig: {} },
        run: successfulRun,
      }),
    ).toBe(false);

    expect(
      shouldReflectAfterRun({
        agent: hermesAgent,
        run: { ...successfulRun, status: "failed" },
      }),
    ).toBe(false);
  });

  it("builds a bounded structured reflection prompt without raw profile paths", () => {
    const prompt = buildHermesRunReflectionPrompt({
      agent: {
        ...hermesAgent,
        runtimeConfig: {
          hermesProfile: {
            kind: "hermes_profile",
            profileName: "builder-runtime",
            hermesHomePath: "/Users/operator/.hermes/profiles/builder-runtime",
            workspacePath: "/Users/operator/workspaces/builder-runtime",
            selfImprovementPolicy: "proposal_only",
          },
        },
      },
      run: successfulRun,
      maxSectionChars: 80,
    });

    expect(prompt).toContain("Return ONLY JSON");
    expect(prompt).toContain('"summary"');
    expect(prompt).toContain("builder-runtime");
    expect(prompt).toContain("Implemented the requested change");
    expect(prompt).not.toContain("/Users/operator");
  });

  it("reads adapter-provided structured reflections from run result JSON", () => {
    expect(
      readStructuredRunReflectionFromResultJson({
        paperclipReflection: {
          summary: "Completed safely.",
          learned: "Keep completion hooks non-blocking.",
          proposedMemoryUpdates: [{ fact: "Completion hooks are non-blocking." }],
        },
      }),
    ).toEqual({
      summary: "Completed safely.",
      learned: "Keep completion hooks non-blocking.",
      proposedMemoryUpdates: [{ fact: "Completion hooks are non-blocking." }],
      proposedSkillUpdates: [],
      sharedChangeProposals: [],
    });

    expect(readStructuredRunReflectionFromResultJson({ paperclipReflection: { summary: "missing learned" } })).toBeNull();
    expect(readStructuredRunReflectionFromResultJson({ summary: "normal run summary" })).toBeNull();
  });

  it("stores proposal-only reflections from a structured reflector response", async () => {
    const db = fakeDb();
    const reflector = vi.fn(async () => ({
      summary: "Run completed and tests passed.",
      learned: "The feature needs a server-side completion hook.",
      proposedMemoryUpdates: [{ fact: "Prefer narrow completion hooks." }],
      proposedSkillUpdates: [],
      sharedChangeProposals: [{ title: "Add governance issue for shared rollout" }],
    }));

    const result = await maybeRecordAgentRunReflection({
      db: db as never,
      agent: hermesAgent,
      run: successfulRun,
      reflector,
    });

    expect(result).toEqual({ recorded: true, reflectionId: "55555555-5555-4555-8555-555555555555" });
    expect(reflector).toHaveBeenCalledOnce();
    expect(db.inserted).toEqual([
      {
        companyId,
        agentId,
        issueId,
        runId,
        summary: "Run completed and tests passed.",
        learned: "The feature needs a server-side completion hook.",
        proposedMemoryUpdates: [{ fact: "Prefer narrow completion hooks." }],
        proposedSkillUpdates: [],
        sharedChangeProposals: [{ title: "Add governance issue for shared rollout" }],
        status: "proposed",
      },
    ]);
  });

  it("does not throw when reflection generation fails", async () => {
    const db = fakeDb();
    const result = await maybeRecordAgentRunReflection({
      db: db as never,
      agent: hermesAgent,
      run: successfulRun,
      reflector: vi.fn(async () => {
        throw new Error("reflection adapter unavailable");
      }),
    });

    expect(result).toEqual({ recorded: false, reason: "reflection_failed" });
    expect(db.inserted).toEqual([]);
  });
});
