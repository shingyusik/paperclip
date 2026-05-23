import { describe, expect, it } from "vitest";
import {
  buildHermesProfileCommand,
  hermesProfileAdapterConfigSchema,
  normalizeHermesProfileAdapterConfig,
} from "./index.js";

describe("Hermes profile adapter boundary", () => {
  it("declares a plugin-renderable config schema without registering a built-in adapter", () => {
    expect(hermesProfileAdapterConfigSchema.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "profileName", required: true }),
        expect.objectContaining({ key: "hermesBin", default: "hermes" }),
        expect.objectContaining({ key: "hermesHomePath" }),
      ]),
    );
  });

  it("normalizes config aliases and rejects missing profile names", () => {
    expect(normalizeHermesProfileAdapterConfig({
      profileName: " operator ",
      command: " /usr/local/bin/hermes ",
      cwd: " /workspace/project ",
      enabledToolsets: [" terminal ", "", "file"],
    })).toMatchObject({
      profileName: "operator",
      hermesBin: "/usr/local/bin/hermes",
      workingDirectory: "/workspace/project",
      enabledToolsets: ["terminal", "file"],
    });

    expect(() => normalizeHermesProfileAdapterConfig({ profileName: "" })).toThrow(
      "non-empty profileName",
    );
  });

  it("builds a Hermes profile chat invocation with args kept shell-safe", () => {
    const spec = buildHermesProfileCommand(
      {
        profileName: "ops profile; rm -rf /",
        hermesBin: "hermes",
        workingDirectory: "/repo",
        enabledToolsets: ["terminal", "file"],
        model: "anthropic/claude-sonnet-4",
        provider: "openrouter",
        yolo: true,
      },
      { prompt: "Implement the issue" },
    );

    expect(spec.command).toBe("hermes");
    expect(spec.cwd).toBe("/repo");
    expect(spec.args).toEqual([
      "--profile",
      "ops profile; rm -rf /",
      "--yolo",
      "chat",
      "--query",
      "Implement the issue",
      "--quiet",
      "--source",
      "paperclip",
      "--model",
      "anthropic/claude-sonnet-4",
      "--provider",
      "openrouter",
      "--toolsets",
      "terminal,file",
    ]);
  });

  it("redacts prompt and Hermes home from display metadata", () => {
    const spec = buildHermesProfileCommand(
      {
        profileName: "operator",
        hermesHomePath: "/Users/person/.hermes/profiles/operator",
        extraArgs: ["--verbose"],
      },
      { prompt: "secret task prompt", resumeSessionId: "session-123" },
    );

    expect(spec.env).toEqual({ HERMES_HOME: "/Users/person/.hermes/profiles/operator" });
    expect(spec.displayEnv).toEqual({ HERMES_HOME: "<redacted hermes home>" });
    expect(spec.args).toContain("secret task prompt");
    expect(spec.displayArgs).toContain("<prompt 18 chars>");
    expect(spec.displayArgs).not.toContain("secret task prompt");
    expect(spec.displayArgs).toEqual([
      "--profile",
      "operator",
      "--resume",
      "session-123",
      "chat",
      "--query",
      "<prompt 18 chars>",
      "--quiet",
      "--source",
      "paperclip",
      "--verbose",
    ]);
  });
});
