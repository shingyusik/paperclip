import { describe, expect, it } from "vitest";
import {
  agentRuntimeConfigSchema,
  hermesProfileRuntimeBindingSchema,
  readHermesProfileRuntimeBinding,
} from "./agent.js";

describe("Hermes profile runtime binding", () => {
  it("accepts a minimal Hermes profile binding and applies safe policy defaults", () => {
    const parsed = hermesProfileRuntimeBindingSchema.parse({
      kind: "hermes_profile",
      profileName: "research-agent",
    });

    expect(parsed).toEqual({
      kind: "hermes_profile",
      profileName: "research-agent",
      memoryPolicy: "private",
      skillPolicy: "private",
      selfImprovementPolicy: "proposal_only",
      visibilityPolicy: "summary_only",
    });
  });

  it("rejects empty profile names and unknown policy values", () => {
    expect(() =>
      hermesProfileRuntimeBindingSchema.parse({
        kind: "hermes_profile",
        profileName: "",
      }),
    ).toThrow();

    expect(() =>
      hermesProfileRuntimeBindingSchema.parse({
        kind: "hermes_profile",
        profileName: "research-agent",
        memoryPolicy: "raw_files_visible",
      }),
    ).toThrow();
  });

  it("normalizes runtimeConfig.hermesProfile while preserving unrelated runtime config", () => {
    const parsed = agentRuntimeConfigSchema.parse({
      heartbeat: { enabled: true },
      modelProfiles: {
        cheap: { adapterConfig: { model: "small" } },
      },
      hermesProfile: {
        kind: "hermes_profile",
        profileName: "operator",
        workspacePath: "/tmp/operator-workspace",
        skillPolicy: "summary_visible",
      },
    });

    expect(parsed.heartbeat).toEqual({ enabled: true });
    expect(parsed.modelProfiles?.cheap?.adapterConfig).toEqual({ model: "small" });
    expect(parsed.hermesProfile).toMatchObject({
      kind: "hermes_profile",
      profileName: "operator",
      workspacePath: "/tmp/operator-workspace",
      memoryPolicy: "private",
      skillPolicy: "summary_visible",
      selfImprovementPolicy: "proposal_only",
      visibilityPolicy: "summary_only",
    });
  });

  it("returns null when runtime config has no valid Hermes profile binding", () => {
    expect(readHermesProfileRuntimeBinding({})).toBeNull();
    expect(readHermesProfileRuntimeBinding({ hermesProfile: { kind: "other" } })).toBeNull();
  });

  it("returns a parsed Hermes profile binding from runtime config", () => {
    expect(
      readHermesProfileRuntimeBinding({
        hermesProfile: {
          kind: "hermes_profile",
          profileName: "oracle",
          selfImprovementPolicy: "auto_private",
        },
      }),
    ).toMatchObject({
      kind: "hermes_profile",
      profileName: "oracle",
      selfImprovementPolicy: "auto_private",
      visibilityPolicy: "summary_only",
    });
  });
});
