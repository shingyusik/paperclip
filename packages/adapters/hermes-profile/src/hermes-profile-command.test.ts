import { describe, expect, it } from "vitest";
import {
  buildHermesProfileCommand,
  buildHermesProfileInvocation,
  createServerAdapter,
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

  it("builds invocation prompts from Paperclip heartbeat context and resumes Hermes sessions", () => {
    const invocation = buildHermesProfileInvocation({
      config: { profileName: "operator" },
      runtime: { sessionId: "legacy-session", sessionDisplayId: null },
      context: {
        paperclipHermesTaskPrompt: "## Agent Identity\nName: Operator\n\n## Current Task\nImplement ISS-1",
        paperclipTaskMarkdown: "fallback task markdown",
      },
    });

    expect(invocation.prompt).toContain("## Current Task\nImplement ISS-1");
    expect(invocation.spec.args).toContain("legacy-session");
    expect(invocation.meta.prompt).toBe("<prompt 65 chars>");
    expect(invocation.meta.commandArgs).not.toContain(invocation.prompt);
  });

  it("exposes a plugin-loadable server adapter boundary", () => {
    const adapter = createServerAdapter();
    expect(adapter.type).toBe("hermes_profile");
    expect(adapter.supportsLocalAgentJwt).toBe(false);
    expect(adapter.agentConfigurationDoc).toContain("Hermes profile");
  });
});
