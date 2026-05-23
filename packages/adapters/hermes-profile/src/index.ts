import type {
  AdapterEnvironmentTestResult,
  AdapterExecutionContext,
  AdapterExecutionResult,
  AdapterInvocationMeta,
  ServerAdapterModule,
} from "@paperclipai/adapter-utils";
import {
  buildInvocationEnvForLogs,
  buildPaperclipEnv,
  ensurePathInEnv,
  resolveCommandForLogs,
  runChildProcess,
} from "@paperclipai/adapter-utils/server-utils";

export type HermesProfileAdapterConfigField = {
  key: string;
  label: string;
  type: "text" | "select" | "toggle" | "number" | "textarea" | "combobox";
  options?: Array<{ label: string; value: string; group?: string }>;
  default?: unknown;
  hint?: string;
  required?: boolean;
  group?: string;
  meta?: Record<string, unknown>;
};

export type HermesProfileAdapterConfigSchema = {
  fields: HermesProfileAdapterConfigField[];
};

export const HERMES_PROFILE_ADAPTER_TYPE = "hermes_profile";
export const PAPERCLIP_HERMES_TASK_PROMPT_CONTEXT_KEY = "paperclipHermesTaskPrompt";

export type HermesProfileAdapterConfig = {
  profileName: string;
  hermesBin?: string;
  hermesHomePath?: string;
  workingDirectory?: string;
  enabledToolsets?: string[];
  model?: string;
  provider?: string;
  source?: string;
  yolo?: boolean;
  extraArgs?: string[];
  timeoutSec?: number;
  graceSec?: number;
};

export type HermesProfileCommandBuildOptions = {
  prompt: string;
  resumeSessionId?: string | null;
};

export type HermesProfileCommandSpec = {
  command: string;
  args: string[];
  cwd?: string;
  env: Record<string, string>;
  displayArgs: string[];
  displayEnv: Record<string, string>;
};

export type HermesProfileInvocationInput = {
  config: unknown;
  runtime: { sessionId?: string | null; sessionDisplayId?: string | null };
  context: Record<string, unknown>;
};

export type HermesProfileInvocation = {
  prompt: string;
  spec: HermesProfileCommandSpec;
  meta: AdapterInvocationMeta;
  timeoutSec: number;
  graceSec: number;
};

const DEFAULT_HERMES_BIN = "hermes";
const DEFAULT_SOURCE = "paperclip";
const DEFAULT_TIMEOUT_SEC = 0;
const DEFAULT_GRACE_SEC = 15;

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function readBoolean(value: unknown): boolean {
  return value === true;
}

function readNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function readContextPrompt(context: Record<string, unknown>): string | null {
  const hermesTaskPrompt = asTrimmedString(context[PAPERCLIP_HERMES_TASK_PROMPT_CONTEXT_KEY]);
  if (hermesTaskPrompt) return hermesTaskPrompt;
  return asTrimmedString(context.paperclipTaskMarkdown) ?? null;
}

export function normalizeHermesProfileAdapterConfig(config: unknown): HermesProfileAdapterConfig {
  const record = asRecord(config);
  const profileName = asTrimmedString(record.profileName);
  if (!profileName) {
    throw new Error("Hermes profile adapter config requires a non-empty profileName");
  }

  return {
    profileName,
    hermesBin: asTrimmedString(record.hermesBin) ?? asTrimmedString(record.command),
    hermesHomePath: asTrimmedString(record.hermesHomePath),
    workingDirectory: asTrimmedString(record.workingDirectory) ?? asTrimmedString(record.cwd),
    enabledToolsets: asStringArray(record.enabledToolsets),
    model: asTrimmedString(record.model),
    provider: asTrimmedString(record.provider),
    source: asTrimmedString(record.source),
    yolo: readBoolean(record.yolo),
    extraArgs: asStringArray(record.extraArgs),
    timeoutSec: readNumber(record.timeoutSec, DEFAULT_TIMEOUT_SEC),
    graceSec: readNumber(record.graceSec, DEFAULT_GRACE_SEC),
  };
}

export function buildHermesProfileCommand(
  config: unknown,
  options: HermesProfileCommandBuildOptions,
): HermesProfileCommandSpec {
  const normalized = normalizeHermesProfileAdapterConfig(config);
  const prompt = options.prompt;
  if (typeof prompt !== "string" || prompt.length === 0) {
    throw new Error("Hermes profile command requires a non-empty prompt");
  }

  const command = normalized.hermesBin ?? DEFAULT_HERMES_BIN;
  const args: string[] = ["--profile", normalized.profileName];
  if (normalized.yolo) args.push("--yolo");
  if (options.resumeSessionId) args.push("--resume", options.resumeSessionId);
  args.push("chat", "--query", prompt, "--quiet", "--source", normalized.source ?? DEFAULT_SOURCE);
  if (normalized.model) args.push("--model", normalized.model);
  if (normalized.provider) args.push("--provider", normalized.provider);
  if (normalized.enabledToolsets && normalized.enabledToolsets.length > 0) {
    args.push("--toolsets", normalized.enabledToolsets.join(","));
  }
  if (normalized.extraArgs && normalized.extraArgs.length > 0) args.push(...normalized.extraArgs);

  const env: Record<string, string> = {};
  const displayEnv: Record<string, string> = {};
  if (normalized.hermesHomePath) {
    env.HERMES_HOME = normalized.hermesHomePath;
    displayEnv.HERMES_HOME = "<redacted hermes home>";
  }

  return {
    command,
    args,
    cwd: normalized.workingDirectory,
    env,
    displayArgs: args.map((arg, index) => {
      if (args[index - 1] === "--query") return `<prompt ${prompt.length} chars>`;
      return arg;
    }),
    displayEnv,
  };
}

export function buildHermesProfileInvocation(input: HermesProfileInvocationInput): HermesProfileInvocation {
  const normalized = normalizeHermesProfileAdapterConfig(input.config);
  const prompt = readContextPrompt(input.context);
  if (!prompt) {
    throw new Error("Hermes profile adapter requires paperclipHermesTaskPrompt or paperclipTaskMarkdown context");
  }
  const resumeSessionId = input.runtime.sessionDisplayId ?? input.runtime.sessionId ?? null;
  const spec = buildHermesProfileCommand(normalized, { prompt, resumeSessionId });
  return {
    prompt,
    spec,
    timeoutSec: normalized.timeoutSec ?? DEFAULT_TIMEOUT_SEC,
    graceSec: normalized.graceSec ?? DEFAULT_GRACE_SEC,
    meta: {
      adapterType: HERMES_PROFILE_ADAPTER_TYPE,
      command: spec.command,
      cwd: spec.cwd,
      commandArgs: spec.displayArgs,
      env: spec.displayEnv,
      prompt: `<prompt ${prompt.length} chars>`,
      promptMetrics: { chars: prompt.length },
    },
  };
}

export function createServerAdapter(): ServerAdapterModule {
  return {
    type: HERMES_PROFILE_ADAPTER_TYPE,
    supportsLocalAgentJwt: false,
    agentConfigurationDoc:
      "Hermes profile adapter. Configure profileName and install this package as an external adapter plugin; Paperclip supplies paperclipHermesTaskPrompt at heartbeat invocation time.",
    async testEnvironment(ctx): Promise<AdapterEnvironmentTestResult> {
      const normalized = normalizeHermesProfileAdapterConfig(ctx.config);
      return {
        adapterType: HERMES_PROFILE_ADAPTER_TYPE,
        status: "pass",
        testedAt: new Date().toISOString(),
        checks: [
          {
            code: "hermes_profile_config",
            level: "info",
            message: `Hermes profile configured: ${normalized.profileName}`,
          },
        ],
      };
    },
    async execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
      const invocation = buildHermesProfileInvocation({
        config: ctx.config,
        runtime: ctx.runtime,
        context: ctx.context,
      });
      const baseEnv = { ...process.env, ...buildPaperclipEnv(ctx.agent), ...invocation.spec.env };
      const runtimeEnv = ensurePathInEnv(baseEnv);
      const cwd = invocation.spec.cwd ?? process.cwd();
      const resolvedCommand = await resolveCommandForLogs(invocation.spec.command, cwd, runtimeEnv);
      const loggedEnv = buildInvocationEnvForLogs(invocation.spec.displayEnv, {
        runtimeEnv,
        includeRuntimeKeys: ["HOME"],
        resolvedCommand,
      });
      await ctx.onMeta?.({
        ...invocation.meta,
        command: resolvedCommand,
        cwd,
        env: loggedEnv,
      });
      const proc = await runChildProcess(ctx.runId, invocation.spec.command, invocation.spec.args, {
        cwd,
        env: invocation.spec.env,
        timeoutSec: invocation.timeoutSec,
        graceSec: invocation.graceSec,
        onLog: ctx.onLog,
        onSpawn: ctx.onSpawn,
      });

      if (proc.timedOut) {
        return {
          exitCode: proc.exitCode,
          signal: proc.signal,
          timedOut: true,
          errorMessage: `Timed out after ${invocation.timeoutSec}s`,
          resultJson: { stdout: proc.stdout, stderr: proc.stderr },
        };
      }
      const result: AdapterExecutionResult = {
        exitCode: proc.exitCode,
        signal: proc.signal,
        timedOut: false,
        resultJson: { stdout: proc.stdout, stderr: proc.stderr },
      };
      if ((proc.exitCode ?? 0) !== 0) {
        result.errorMessage = `Hermes profile process exited with code ${proc.exitCode ?? -1}`;
      }
      return result;
    },
  };
}

export const hermesProfileAdapterConfigSchema: HermesProfileAdapterConfigSchema = {
  fields: [
    {
      key: "profileName",
      label: "Hermes profile",
      type: "text",
      required: true,
      hint: "Named Hermes profile to run with `hermes --profile <name>`.",
    },
    {
      key: "hermesBin",
      label: "Hermes binary",
      type: "text",
      default: DEFAULT_HERMES_BIN,
      hint: "Command or absolute path used to launch Hermes. Defaults to hermes.",
    },
    {
      key: "hermesHomePath",
      label: "Hermes home path",
      type: "text",
      hint: "Optional HERMES_HOME override for isolated runtime state. Redacted from logs.",
    },
    {
      key: "workingDirectory",
      label: "Working directory",
      type: "text",
      hint: "Optional cwd for the Hermes process.",
    },
    {
      key: "enabledToolsets",
      label: "Enabled toolsets",
      type: "text",
      hint: "Optional comma-separated toolsets passed to hermes chat --toolsets.",
    },
    {
      key: "model",
      label: "Model",
      type: "text",
      hint: "Optional model override passed to Hermes chat.",
    },
    {
      key: "provider",
      label: "Provider",
      type: "text",
      hint: "Optional provider override passed to Hermes chat.",
    },
    {
      key: "timeoutSec",
      label: "Timeout seconds",
      type: "number",
      default: DEFAULT_TIMEOUT_SEC,
      hint: "Optional process timeout. 0 disables the timeout.",
    },
    {
      key: "yolo",
      label: "Bypass Hermes approvals",
      type: "toggle",
      default: false,
      hint: "Passes --yolo to Hermes. Use only in trusted runtimes.",
    },
  ],
};
