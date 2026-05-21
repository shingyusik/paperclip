import type { IssueStatus } from "../constants.js";
import type { Issue } from "./issue.js";

export const PROJECT_MILESTONE_STATUSES = ["planned", "in_progress", "completed", "cancelled"] as const;

export type ProjectMilestoneStatus = (typeof PROJECT_MILESTONE_STATUSES)[number];

export type ProjectMilestoneProgress = Partial<Record<IssueStatus, number>>;

export interface ProjectMilestoneIssue {
  id: string;
  companyId: string;
  projectId: string;
  milestoneId: string;
  issueId: string;
  position: number;
  issue: Issue;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectMilestone {
  id: string;
  companyId: string;
  projectId: string;
  title: string;
  description: string | null;
  status: ProjectMilestoneStatus;
  targetDate: string | null;
  position: number;
  archivedAt: Date | null;
  progress: ProjectMilestoneProgress;
  issues: ProjectMilestoneIssue[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectRoadmap {
  projectId: string;
  companyId: string;
  milestones: ProjectMilestone[];
  unassignedIssues: Issue[];
}
