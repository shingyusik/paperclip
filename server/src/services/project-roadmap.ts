import { and, asc, eq, inArray } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  issues,
  projectMilestoneIssues,
  projectMilestones,
  projects,
} from "@paperclipai/db";
import type { ProjectMilestoneProgress } from "@paperclipai/shared";
import { conflict, unprocessable } from "../errors.js";
import { issueService } from "./issues.js";

export function projectRoadmapService(db: Db) {
  const issuesSvc = issueService(db);

  async function assertProject(projectId: string) {
    const project = await db
      .select({ id: projects.id, companyId: projects.companyId })
      .from(projects)
      .where(eq(projects.id, projectId))
      .then((rows) => rows[0] ?? null);
    if (!project) return null;
    return project;
  }

  function buildProgress(issueRows: Array<{ status: string }>): ProjectMilestoneProgress {
    return issueRows.reduce<Record<string, number>>((progress, issue) => {
      progress[issue.status] = (progress[issue.status] ?? 0) + 1;
      return progress;
    }, {}) as ProjectMilestoneProgress;
  }

  return {
    getRoadmap: async (projectId: string) => {
      const project = await assertProject(projectId);
      if (!project) return null;

      const [milestones, links, projectIssues] = await Promise.all([
        db
          .select()
          .from(projectMilestones)
          .where(and(eq(projectMilestones.companyId, project.companyId), eq(projectMilestones.projectId, project.id)))
          .orderBy(asc(projectMilestones.position), asc(projectMilestones.createdAt)),
        db
          .select()
          .from(projectMilestoneIssues)
          .where(and(eq(projectMilestoneIssues.companyId, project.companyId), eq(projectMilestoneIssues.projectId, project.id)))
          .orderBy(asc(projectMilestoneIssues.position), asc(projectMilestoneIssues.createdAt)),
        issuesSvc.list(project.companyId, {
          projectId: project.id,
          includePluginOperations: true,
          limit: 1000,
        }),
      ]);

      const issuesById = new Map(projectIssues.map((issue) => [issue.id, issue]));
      const linkedIssueIds = new Set(links.map((link) => link.issueId));
      const linksByMilestoneId = new Map<string, typeof links>();
      for (const link of links) {
        const bucket = linksByMilestoneId.get(link.milestoneId) ?? [];
        bucket.push(link);
        linksByMilestoneId.set(link.milestoneId, bucket);
      }

      return {
        projectId: project.id,
        companyId: project.companyId,
        milestones: milestones.map((milestone) => {
          const milestoneIssues = (linksByMilestoneId.get(milestone.id) ?? [])
            .map((link) => {
              const issue = issuesById.get(link.issueId);
              return issue
                ? {
                    ...link,
                    issue,
                  }
                : null;
            })
            .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
          return {
            ...milestone,
            progress: buildProgress(milestoneIssues.map((entry) => entry.issue)),
            issues: milestoneIssues,
          };
        }),
        unassignedIssues: projectIssues.filter((issue) => !linkedIssueIds.has(issue.id)),
      };
    },

    createMilestone: async (
      projectId: string,
      input: {
        title: string;
        description?: string | null;
        status?: string;
        targetDate?: string | null;
        position?: number;
      },
    ) => {
      const project = await assertProject(projectId);
      if (!project) return null;
      const now = new Date();
      const [milestone] = await db
        .insert(projectMilestones)
        .values({
          companyId: project.companyId,
          projectId: project.id,
          title: input.title,
          description: input.description ?? null,
          status: input.status ?? "planned",
          targetDate: input.targetDate ?? null,
          position: input.position ?? 0,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return milestone;
    },

    updateMilestone: async (
      projectId: string,
      milestoneId: string,
      input: {
        title?: string;
        description?: string | null;
        status?: string;
        targetDate?: string | null;
        position?: number;
        archivedAt?: string | null;
      },
    ) => {
      const project = await assertProject(projectId);
      if (!project) return null;
      const [milestone] = await db
        .update(projectMilestones)
        .set({
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.targetDate !== undefined ? { targetDate: input.targetDate } : {}),
          ...(input.position !== undefined ? { position: input.position } : {}),
          ...(input.archivedAt !== undefined ? { archivedAt: input.archivedAt ? new Date(input.archivedAt) : null } : {}),
          updatedAt: new Date(),
        })
        .where(and(
          eq(projectMilestones.companyId, project.companyId),
          eq(projectMilestones.projectId, project.id),
          eq(projectMilestones.id, milestoneId),
        ))
        .returning();
      return milestone ?? null;
    },

    reorderMilestones: async (projectId: string, milestoneIds: string[]) => {
      const project = await assertProject(projectId);
      if (!project) return null;
      const existing = await db
        .select({ id: projectMilestones.id })
        .from(projectMilestones)
        .where(and(
          eq(projectMilestones.companyId, project.companyId),
          eq(projectMilestones.projectId, project.id),
          inArray(projectMilestones.id, milestoneIds),
        ));
      if (existing.length !== milestoneIds.length) throw unprocessable("One or more milestones do not belong to this project");
      const now = new Date();
      await db.transaction(async (tx) => {
        for (const [position, milestoneId] of milestoneIds.entries()) {
          await tx
            .update(projectMilestones)
            .set({ position, updatedAt: now })
            .where(eq(projectMilestones.id, milestoneId));
        }
      });
      return await db
        .select()
        .from(projectMilestones)
        .where(and(eq(projectMilestones.companyId, project.companyId), eq(projectMilestones.projectId, project.id)))
        .orderBy(asc(projectMilestones.position), asc(projectMilestones.createdAt));
    },

    deleteMilestone: async (projectId: string, milestoneId: string) => {
      const project = await assertProject(projectId);
      if (!project) return null;
      const [milestone] = await db
        .delete(projectMilestones)
        .where(and(
          eq(projectMilestones.companyId, project.companyId),
          eq(projectMilestones.projectId, project.id),
          eq(projectMilestones.id, milestoneId),
        ))
        .returning();
      return milestone ?? null;
    },

    linkIssue: async (projectId: string, milestoneId: string, issueId: string, position?: number) => {
      const project = await assertProject(projectId);
      if (!project) return null;
      const [milestone, issue] = await Promise.all([
        db
          .select({ id: projectMilestones.id })
          .from(projectMilestones)
          .where(and(
            eq(projectMilestones.companyId, project.companyId),
            eq(projectMilestones.projectId, project.id),
            eq(projectMilestones.id, milestoneId),
          ))
          .then((rows) => rows[0] ?? null),
        db
          .select({ id: issues.id, projectId: issues.projectId })
          .from(issues)
          .where(and(eq(issues.companyId, project.companyId), eq(issues.id, issueId)))
          .then((rows) => rows[0] ?? null),
      ]);
      if (!milestone) throw unprocessable("Milestone does not belong to this project");
      if (!issue || issue.projectId !== project.id) throw unprocessable("Issue does not belong to this project");

      try {
        const now = new Date();
        const [link] = await db
          .insert(projectMilestoneIssues)
          .values({
            companyId: project.companyId,
            projectId: project.id,
            milestoneId,
            issueId,
            position: position ?? 0,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        return link;
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "23505") {
          throw conflict("Issue is already linked to a milestone in this project");
        }
        throw error;
      }
    },

    unlinkIssue: async (projectId: string, milestoneId: string, issueId: string) => {
      const project = await assertProject(projectId);
      if (!project) return null;
      const [link] = await db
        .delete(projectMilestoneIssues)
        .where(and(
          eq(projectMilestoneIssues.companyId, project.companyId),
          eq(projectMilestoneIssues.projectId, project.id),
          eq(projectMilestoneIssues.milestoneId, milestoneId),
          eq(projectMilestoneIssues.issueId, issueId),
        ))
        .returning();
      return link ?? null;
    },

    reorderIssues: async (projectId: string, milestoneId: string, issueIds: string[]) => {
      const project = await assertProject(projectId);
      if (!project) return null;
      const links = await db
        .select({ issueId: projectMilestoneIssues.issueId })
        .from(projectMilestoneIssues)
        .where(and(
          eq(projectMilestoneIssues.companyId, project.companyId),
          eq(projectMilestoneIssues.projectId, project.id),
          eq(projectMilestoneIssues.milestoneId, milestoneId),
          inArray(projectMilestoneIssues.issueId, issueIds),
        ));
      if (links.length !== issueIds.length) throw unprocessable("One or more issues are not linked to this milestone");
      const now = new Date();
      await db.transaction(async (tx) => {
        for (const [position, issueId] of issueIds.entries()) {
          await tx
            .update(projectMilestoneIssues)
            .set({ position, updatedAt: now })
            .where(and(eq(projectMilestoneIssues.milestoneId, milestoneId), eq(projectMilestoneIssues.issueId, issueId)));
        }
      });
      return await db
        .select()
        .from(projectMilestoneIssues)
        .where(and(
          eq(projectMilestoneIssues.companyId, project.companyId),
          eq(projectMilestoneIssues.projectId, project.id),
          eq(projectMilestoneIssues.milestoneId, milestoneId),
        ))
        .orderBy(asc(projectMilestoneIssues.position), asc(projectMilestoneIssues.createdAt));
    },
  };
}
