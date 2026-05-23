import type { ReactNode } from "react";
import type { AgentRuntimeSummary } from "@paperclipai/shared";

export type AgentDetailView =
  | "dashboard"
  | "instructions"
  | "configuration"
  | "skills"
  | "runs"
  | "budget"
  | "memory"
  | "meetings"
  | "reflections"
  | "improvements";

export const AGENT_DETAIL_TABS: Array<{ value: AgentDetailView; label: string }> = [
  { value: "dashboard", label: "Overview" },
  { value: "runs", label: "Current Work" },
  { value: "memory", label: "Memory" },
  { value: "skills", label: "Skills" },
  { value: "meetings", label: "Meetings" },
  { value: "reflections", label: "Reflections" },
  { value: "improvements", label: "Improvements" },
  { value: "configuration", label: "Settings" },
  { value: "instructions", label: "Instructions" },
  { value: "budget", label: "Budget" },
];

export function parseAgentDetailView(value: string | null): AgentDetailView {
  if (value === "overview") return "dashboard";
  if (value === "current-work") return "runs";
  if (value === "settings") return "configuration";
  if (value === "instructions" || value === "prompts") return "instructions";
  if (value === "configure" || value === "configuration") return "configuration";
  if (value === "skills") return "skills";
  if (value === "budget") return "budget";
  if (value === "runs") return "runs";
  if (value === "memory") return "memory";
  if (value === "meetings") return "meetings";
  if (value === "reflections") return "reflections";
  if (value === "improvements") return "improvements";
  return "dashboard";
}

export function canonicalAgentDetailTab(value: AgentDetailView): AgentDetailView {
  return value;
}

function SummaryMetric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}

function emptyStateForView(view: AgentDetailView) {
  switch (view) {
    case "memory":
      return "Memory remains private by default. Policy summaries and approved memory notes will appear here after runtime reflections.";
    case "meetings":
      return "Meeting context will appear here after meeting rooms are connected to agent runs.";
    case "reflections":
      return "Structured reflections will appear here after completed Hermes-backed runs.";
    case "improvements":
      return "Proposed memory, skill, and shared-state improvements will appear here for review before application.";
    default:
      return "Runtime growth information will appear here after the agent starts producing auditable runtime metadata.";
  }
}

export function AgentRuntimeGrowthPanel({
  view,
  summary,
  isLoading,
  error,
}: {
  view: AgentDetailView;
  summary: AgentRuntimeSummary | null | undefined;
  isLoading: boolean;
  error: unknown;
}) {
  const title = AGENT_DETAIL_TABS.find((tab) => tab.value === view)?.label ?? "Runtime";

  if (isLoading) {
    return (
      <div className="max-w-4xl rounded-lg border border-border p-6 text-sm text-muted-foreground">
        Loading runtime summary…
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
        Could not load runtime summary.
      </div>
    );
  }

  const warnings = summary?.warnings ?? [];

  return (
    <div className="max-w-4xl space-y-4">
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="text-sm text-muted-foreground">
              Safe runtime summary metadata. Raw private Hermes files are not exposed here.
            </p>
          </div>
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
            {summary?.kind === "hermes_profile" ? "Hermes profile" : "No runtime binding"}
          </span>
        </div>

        {summary?.kind === "hermes_profile" ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <SummaryMetric label="Profile" value={summary.profileName} />
            <SummaryMetric label="Memory policy" value={summary.memoryPolicy} />
            <SummaryMetric label="Skill policy" value={summary.skillPolicy} />
            <SummaryMetric label="Self-improvement" value={summary.selfImprovementPolicy} />
            <SummaryMetric label="Visibility" value={summary.visibilityPolicy} />
            <SummaryMetric label="Last reflection" value={summary.lastReflectionAt ?? "None yet"} />
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            No Hermes profile runtime binding is configured for this agent.
          </p>
        )}

        {warnings.length > 0 && (
          <div className="mt-4 rounded-md border border-amber-300/50 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            {warnings.join(" ")}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground">
        {emptyStateForView(view)}
      </div>
    </div>
  );
}
