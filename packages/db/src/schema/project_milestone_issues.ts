import { index, integer, pgTable, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { issues } from "./issues.js";
import { projectMilestones } from "./project_milestones.js";
import { projects } from "./projects.js";

export const projectMilestoneIssues = pgTable(
  "project_milestone_issues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    milestoneId: uuid("milestone_id").notNull().references(() => projectMilestones.id, { onDelete: "cascade" }),
    issueId: uuid("issue_id").notNull().references(() => issues.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    milestonePositionIdx: index("project_milestone_issues_milestone_position_idx").on(
      table.milestoneId,
      table.position,
    ),
    projectIssueUq: uniqueIndex("project_milestone_issues_project_issue_uq").on(table.projectId, table.issueId),
    milestoneIssueUq: uniqueIndex("project_milestone_issues_milestone_issue_uq").on(
      table.milestoneId,
      table.issueId,
    ),
  }),
);
