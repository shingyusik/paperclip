import { z } from "zod";
import { PROJECT_MILESTONE_STATUSES } from "../types/project-roadmap.js";

export const projectMilestoneStatusSchema = z.enum(PROJECT_MILESTONE_STATUSES);

export const createProjectMilestoneSchema = z.object({
  title: z.string().trim().min(1).max(240),
  description: z.string().trim().max(20000).nullable().optional(),
  status: projectMilestoneStatusSchema.optional().default("planned"),
  targetDate: z.string().date().nullable().optional(),
  position: z.number().int().min(0).optional(),
});

export const updateProjectMilestoneSchema = z.object({
  title: z.string().trim().min(1).max(240).optional(),
  description: z.string().trim().max(20000).nullable().optional(),
  status: projectMilestoneStatusSchema.optional(),
  targetDate: z.string().date().nullable().optional(),
  position: z.number().int().min(0).optional(),
  archivedAt: z.string().datetime().nullable().optional(),
});

export const reorderProjectMilestonesSchema = z.object({
  milestoneIds: z.array(z.string().uuid()).min(1),
});

export const linkProjectMilestoneIssueSchema = z.object({
  issueId: z.string().uuid(),
  position: z.number().int().min(0).optional(),
});

export const reorderProjectMilestoneIssuesSchema = z.object({
  issueIds: z.array(z.string().uuid()).min(1),
});

export type CreateProjectMilestone = z.infer<typeof createProjectMilestoneSchema>;
export type UpdateProjectMilestone = z.infer<typeof updateProjectMilestoneSchema>;
export type ReorderProjectMilestones = z.infer<typeof reorderProjectMilestonesSchema>;
export type LinkProjectMilestoneIssue = z.infer<typeof linkProjectMilestoneIssueSchema>;
export type ReorderProjectMilestoneIssues = z.infer<typeof reorderProjectMilestoneIssuesSchema>;
