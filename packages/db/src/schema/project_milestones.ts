import { index, integer, pgTable, text, timestamp, uuid, date } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { projects } from "./projects.js";

export const projectMilestones = pgTable(
  "project_milestones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status").notNull().default("planned"),
    targetDate: date("target_date"),
    position: integer("position").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyProjectIdx: index("project_milestones_company_project_idx").on(table.companyId, table.projectId),
    projectPositionIdx: index("project_milestones_project_position_idx").on(table.projectId, table.position),
    projectStatusIdx: index("project_milestones_project_status_idx").on(table.projectId, table.status),
  }),
);
