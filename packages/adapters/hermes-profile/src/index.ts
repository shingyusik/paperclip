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

const DEFAULT_HERMES_BIN = "hermes";
const DEFAULT_SOURCE = "paperclip";

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
      key: "yolo",
      label: "Bypass Hermes approvals",
      type: "toggle",
      default: false,
      hint: "Passes --yolo to Hermes. Use only in trusted runtimes.",
    },
  ],
};
