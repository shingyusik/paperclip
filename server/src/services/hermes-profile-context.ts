import { redactSensitiveText } from "../redaction.js";

export type HermesProfilePromptAgent = {
  name: string;
  role?: string | null;
  reportingLine?: string | null;
  runtimeSummary?: string | null;
};

export type HermesProfileTaskPromptInput = {
  agent: HermesProfilePromptAgent;
  companyMission?: string | null;
  projectRoadmap?: string | null;
  projectSpec?: string | null;
  milestoneContext?: string | null;
  taskContext?: string | null;
  issuePlan?: string | null;
  meetingContext?: string | null;
  acceptanceCriteria?: string[] | string | null;
  maxSectionChars?: number;
};

export const HERMES_PROFILE_TASK_PROMPT_CONTEXT_KEY = "paperclipHermesTaskPrompt";

const DEFAULT_MAX_SECTION_CHARS = 4_000;

function cleanText(value: string | null | undefined): string {
  return (value ?? "").replace(/\r\n/g, "\n").replace(/[\t ]+\n/g, "\n").trim();
}

function clampText(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(0, maxChars - 31)).trimEnd()}\n...[truncated ${value.length - maxChars} chars]`;
}

function sanitizeSectionText(value: string, maxChars: number): string {
  return clampText(redactSensitiveText(value), maxChars);
}

function appendSection(sections: string[], title: string, body: string | null | undefined, maxChars: number) {
  const cleaned = cleanText(body);
  if (!cleaned) return;
  sections.push(`## ${title}\n${sanitizeSectionText(cleaned, maxChars)}`);
}

function formatAcceptanceCriteria(value: HermesProfileTaskPromptInput["acceptanceCriteria"]): string {
  if (Array.isArray(value)) {
    return value.map((item) => cleanText(item)).filter(Boolean).map((item) => `- ${item}`).join("\n");
  }
  return cleanText(value);
}

export function buildHermesProfileTaskPrompt(input: HermesProfileTaskPromptInput): string {
  const maxSectionChars = input.maxSectionChars ?? DEFAULT_MAX_SECTION_CHARS;
  const sections: string[] = [];
  const agentLines = [
    `Name: ${input.agent.name}`,
    input.agent.role ? `Role: ${input.agent.role}` : null,
    input.agent.reportingLine ? `Reporting line: ${input.agent.reportingLine}` : null,
  ].filter(Boolean).join("\n");

  appendSection(sections, "Agent Identity", agentLines, maxSectionChars);
  appendSection(sections, "Private Runtime Summary", input.agent.runtimeSummary, maxSectionChars);
  appendSection(sections, "Company Mission", input.companyMission, maxSectionChars);
  appendSection(sections, "Project Roadmap", input.projectRoadmap, maxSectionChars);
  appendSection(sections, "Project Spec / Decisions", input.projectSpec, maxSectionChars);
  appendSection(sections, "Current Milestone", input.milestoneContext, maxSectionChars);
  appendSection(sections, "Current Task", input.taskContext, maxSectionChars);
  appendSection(sections, "Current Issue Plan", input.issuePlan, maxSectionChars);
  appendSection(sections, "Meeting Room Context", input.meetingContext, maxSectionChars);
  appendSection(sections, "Acceptance Criteria", formatAcceptanceCriteria(input.acceptanceCriteria), maxSectionChars);

  sections.push([
    "## Operating Rules",
    "- Work only within the provided Paperclip context unless the task explicitly asks for broader discovery.",
    "- Prefer auditable updates: summarize actions, decisions, and follow-up proposals clearly.",
    "- Do not reveal raw private Hermes memory, skill files, credentials, or local profile paths in Paperclip-visible output.",
  ].join("\n"));

  return sections.join("\n\n");
}

export function attachHermesProfileTaskPrompt(
  context: Record<string, unknown>,
  input: HermesProfileTaskPromptInput,
): Record<string, unknown> {
  context[HERMES_PROFILE_TASK_PROMPT_CONTEXT_KEY] = buildHermesProfileTaskPrompt(input);
  return context;
}
