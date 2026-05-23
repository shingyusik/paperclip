import { agentReflections, type Db } from "@paperclipai/db";
import {
  createAgentReflectionSchema,
  readHermesProfileRuntimeBinding,
  type CreateAgentReflection,
} from "@paperclipai/shared";
import { parseObject } from "../adapters/utils.js";
import { logger } from "../middleware/logger.js";
import { redactSensitiveText } from "../redaction.js";

const DEFAULT_REFLECTION_SECTION_MAX_CHARS = 2_000;

type ReflectionAgent = {
  id: string;
  companyId: string;
  name?: string | null;
  runtimeConfig?: unknown;
};

type ReflectionRun = {
  id: string;
  companyId: string;
  agentId: string;
  status: string;
  contextSnapshot?: unknown;
  resultJson?: unknown;
  stdoutExcerpt?: string | null;
  stderrExcerpt?: string | null;
};

export type StructuredRunReflection = Pick<
  CreateAgentReflection,
  "summary" | "learned" | "proposedMemoryUpdates" | "proposedSkillUpdates" | "sharedChangeProposals"
>;

export type RunReflectionReflector = (input: {
  prompt: string;
  agent: ReflectionAgent;
  run: ReflectionRun;
}) => Promise<StructuredRunReflection | null>;

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\r\n/g, "\n").trim() : "";
}

function clampText(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(0, maxChars - 31)).trimEnd()}\n...[truncated ${value.length - maxChars} chars]`;
}

function appendSection(sections: string[], title: string, value: unknown, maxChars: number) {
  const cleaned = cleanText(value);
  if (!cleaned) return;
  sections.push(`## ${title}\n${clampText(redactSensitiveText(cleaned), maxChars)}`);
}

function readIssueId(run: ReflectionRun): string | null {
  const context = parseObject(run.contextSnapshot);
  const issueId = cleanText(context.issueId) || cleanText(context.taskId);
  return issueId || null;
}

function readResultSummary(resultJson: unknown): string | null {
  const result = parseObject(resultJson);
  const summary = cleanText(result.summary) || cleanText(result.resultSummary) || cleanText(result.outputSummary);
  return summary || null;
}

export function shouldReflectAfterRun(input: { agent: ReflectionAgent; run: ReflectionRun }): boolean {
  if (input.run.status !== "succeeded") return false;
  if (input.run.companyId !== input.agent.companyId || input.run.agentId !== input.agent.id) return false;
  const binding = readHermesProfileRuntimeBinding(input.agent.runtimeConfig);
  if (!binding) return false;
  return binding.selfImprovementPolicy !== "disabled";
}

export function buildHermesRunReflectionPrompt(input: {
  agent: ReflectionAgent;
  run: ReflectionRun;
  maxSectionChars?: number;
}): string {
  const binding = readHermesProfileRuntimeBinding(input.agent.runtimeConfig);
  const maxSectionChars = input.maxSectionChars ?? DEFAULT_REFLECTION_SECTION_MAX_CHARS;
  const sections = [
    "You are reflecting on a completed Paperclip agent run.",
    "Return ONLY JSON with this exact shape:",
    JSON.stringify(
      {
        summary: "short operator-visible summary of what happened",
        learned: "durable lesson or nothing material learned",
        proposedMemoryUpdates: [{ fact: "agent-private memory proposal" }],
        proposedSkillUpdates: [{ name: "skill-name", change: "skill update proposal" }],
        sharedChangeProposals: [{ title: "issue-backed shared change proposal", reason: "why" }],
      },
      null,
      2,
    ),
    "Rules:",
    "- Do not include secrets, raw private Hermes memory, raw skill files, or local profile paths.",
    "- Keep proposals auditable and concise.",
    "- Shared organization/project changes must be proposals only, not applied changes.",
    "- Use empty arrays when there are no proposals.",
  ];

  appendSection(sections, "Agent", `Name: ${input.agent.name ?? input.agent.id}\nHermes profile: ${binding?.profileName ?? "unknown"}`, maxSectionChars);
  appendSection(sections, "Run Result Summary", readResultSummary(input.run.resultJson), maxSectionChars);
  appendSection(sections, "Stdout Excerpt", input.run.stdoutExcerpt, maxSectionChars);
  appendSection(sections, "Stderr Excerpt", input.run.stderrExcerpt, maxSectionChars);

  return sections.join("\n\n");
}

function normalizeReflectionPayload(payload: StructuredRunReflection): StructuredRunReflection {
  const parsed = createAgentReflectionSchema.parse({
    companyId: "00000000-0000-4000-8000-000000000000",
    agentId: "00000000-0000-4000-8000-000000000000",
    summary: payload.summary,
    learned: payload.learned,
    proposedMemoryUpdates: payload.proposedMemoryUpdates ?? [],
    proposedSkillUpdates: payload.proposedSkillUpdates ?? [],
    sharedChangeProposals: payload.sharedChangeProposals ?? [],
  });
  return {
    summary: parsed.summary,
    learned: parsed.learned,
    proposedMemoryUpdates: parsed.proposedMemoryUpdates,
    proposedSkillUpdates: parsed.proposedSkillUpdates,
    sharedChangeProposals: parsed.sharedChangeProposals,
  };
}

function reflectionStatusFor(payload: StructuredRunReflection): CreateAgentReflection["status"] {
  return payload.proposedMemoryUpdates.length > 0 ||
    payload.proposedSkillUpdates.length > 0 ||
    payload.sharedChangeProposals.length > 0
    ? "proposed"
    : "recorded";
}

export function readStructuredRunReflectionFromResultJson(resultJson: unknown): StructuredRunReflection | null {
  const result = parseObject(resultJson);
  const candidate = parseObject(result.paperclipReflection) ?? parseObject(result.reflection);
  if (!candidate) return null;
  try {
    return normalizeReflectionPayload({
      summary: cleanText(candidate.summary),
      learned: cleanText(candidate.learned),
      proposedMemoryUpdates: Array.isArray(candidate.proposedMemoryUpdates) ? candidate.proposedMemoryUpdates : [],
      proposedSkillUpdates: Array.isArray(candidate.proposedSkillUpdates) ? candidate.proposedSkillUpdates : [],
      sharedChangeProposals: Array.isArray(candidate.sharedChangeProposals) ? candidate.sharedChangeProposals : [],
    });
  } catch {
    return null;
  }
}

export async function maybeRecordAgentRunReflection(input: {
  db: Db;
  agent: ReflectionAgent;
  run: ReflectionRun;
  reflector?: RunReflectionReflector | null;
}): Promise<{ recorded: true; reflectionId: string | null } | { recorded: false; reason: string }> {
  if (!shouldReflectAfterRun({ agent: input.agent, run: input.run })) {
    return { recorded: false, reason: "not_applicable" };
  }
  if (!input.reflector) {
    return { recorded: false, reason: "reflection_unsupported" };
  }

  try {
    const prompt = buildHermesRunReflectionPrompt({ agent: input.agent, run: input.run });
    const reflected = await input.reflector({ prompt, agent: input.agent, run: input.run });
    if (!reflected) return { recorded: false, reason: "empty_reflection" };

    const normalized = normalizeReflectionPayload(reflected);
    const values = createAgentReflectionSchema.parse({
      companyId: input.run.companyId,
      agentId: input.run.agentId,
      issueId: readIssueId(input.run),
      runId: input.run.id,
      ...normalized,
      status: reflectionStatusFor(normalized),
    });

    const inserted = await input.db
      .insert(agentReflections)
      .values(values)
      .returning()
      .then((rows) => rows[0] ?? null);

    return { recorded: true, reflectionId: inserted?.id ?? null };
  } catch (err) {
    logger.warn(
      {
        err,
        runId: input.run.id,
        agentId: input.agent.id,
        companyId: input.agent.companyId,
      },
      "failed to record agent run reflection",
    );
    return { recorded: false, reason: "reflection_failed" };
  }
}
