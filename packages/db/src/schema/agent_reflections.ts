import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { agents } from "./agents.js";
import { companies } from "./companies.js";
import { heartbeatRuns } from "./heartbeat_runs.js";
import { issues } from "./issues.js";

export const agentReflections = pgTable(
  "agent_reflections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    agentId: uuid("agent_id").notNull().references(() => agents.id),
    issueId: uuid("issue_id").references(() => issues.id, { onDelete: "set null" }),
    runId: uuid("run_id").references(() => heartbeatRuns.id, { onDelete: "set null" }),
    summary: text("summary").notNull(),
    learned: text("learned").notNull(),
    proposedMemoryUpdates: jsonb("proposed_memory_updates")
      .$type<Record<string, unknown>[]>()
      .notNull()
      .default([]),
    proposedSkillUpdates: jsonb("proposed_skill_updates")
      .$type<Record<string, unknown>[]>()
      .notNull()
      .default([]),
    sharedChangeProposals: jsonb("shared_change_proposals")
      .$type<Record<string, unknown>[]>()
      .notNull()
      .default([]),
    status: text("status").notNull().default("recorded"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyAgentStatusIdx: index("agent_reflections_company_agent_status_idx").on(
      table.companyId,
      table.agentId,
      table.status,
    ),
    companyAgentUpdatedIdx: index("agent_reflections_company_agent_updated_idx").on(
      table.companyId,
      table.agentId,
      table.updatedAt,
    ),
    companyIssueIdx: index("agent_reflections_company_issue_idx").on(table.companyId, table.issueId),
    companyRunIdx: index("agent_reflections_company_run_idx").on(table.companyId, table.runId),
  }),
);
