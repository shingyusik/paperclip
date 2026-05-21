import type {
  Project,
  ProjectRoadmap,
  ProjectMilestone,
  ProjectMilestoneIssue,
  ProjectWorkspace,
  WorkspaceOperation,
  WorkspaceRuntimeControlTarget,
} from "@paperclipai/shared";
import { api } from "./client";
import { sanitizeWorkspaceRuntimeControlTarget } from "./workspace-runtime-control";

function withCompanyScope(path: string, companyId?: string) {
  if (!companyId) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}companyId=${encodeURIComponent(companyId)}`;
}

function projectPath(id: string, companyId?: string, suffix = "") {
  return withCompanyScope(`/projects/${encodeURIComponent(id)}${suffix}`, companyId);
}

export const projectsApi = {
  list: (companyId: string) => api.get<Project[]>(`/companies/${companyId}/projects`),
  get: (id: string, companyId?: string) => api.get<Project>(projectPath(id, companyId)),
  create: (companyId: string, data: Record<string, unknown>) =>
    api.post<Project>(`/companies/${companyId}/projects`, data),
  update: (id: string, data: Record<string, unknown>, companyId?: string) =>
    api.patch<Project>(projectPath(id, companyId), data),
  getRoadmap: (projectId: string, companyId?: string) =>
    api.get<ProjectRoadmap>(projectPath(projectId, companyId, "/roadmap")),
  createMilestone: (projectId: string, data: Record<string, unknown>, companyId?: string) =>
    api.post<ProjectMilestone>(projectPath(projectId, companyId, "/roadmap/milestones"), data),
  updateMilestone: (projectId: string, milestoneId: string, data: Record<string, unknown>, companyId?: string) =>
    api.patch<ProjectMilestone>(
      projectPath(projectId, companyId, `/roadmap/milestones/${encodeURIComponent(milestoneId)}`),
      data,
    ),
  deleteMilestone: (projectId: string, milestoneId: string, companyId?: string) =>
    api.delete<ProjectMilestone>(
      projectPath(projectId, companyId, `/roadmap/milestones/${encodeURIComponent(milestoneId)}`),
    ),
  linkMilestoneIssue: (projectId: string, milestoneId: string, data: Record<string, unknown>, companyId?: string) =>
    api.post<ProjectMilestoneIssue>(
      projectPath(projectId, companyId, `/roadmap/milestones/${encodeURIComponent(milestoneId)}/issues`),
      data,
    ),
  unlinkMilestoneIssue: (projectId: string, milestoneId: string, issueId: string, companyId?: string) =>
    api.delete<ProjectMilestoneIssue>(
      projectPath(
        projectId,
        companyId,
        `/roadmap/milestones/${encodeURIComponent(milestoneId)}/issues/${encodeURIComponent(issueId)}`,
      ),
    ),
  listWorkspaces: (projectId: string, companyId?: string) =>
    api.get<ProjectWorkspace[]>(projectPath(projectId, companyId, "/workspaces")),
  createWorkspace: (projectId: string, data: Record<string, unknown>, companyId?: string) =>
    api.post<ProjectWorkspace>(projectPath(projectId, companyId, "/workspaces"), data),
  updateWorkspace: (projectId: string, workspaceId: string, data: Record<string, unknown>, companyId?: string) =>
    api.patch<ProjectWorkspace>(
      projectPath(projectId, companyId, `/workspaces/${encodeURIComponent(workspaceId)}`),
      data,
    ),
  controlWorkspaceRuntimeServices: (
    projectId: string,
    workspaceId: string,
    action: "start" | "stop" | "restart",
    companyId?: string,
    target: WorkspaceRuntimeControlTarget = {},
  ) =>
    api.post<{ workspace: ProjectWorkspace; operation: WorkspaceOperation }>(
      projectPath(projectId, companyId, `/workspaces/${encodeURIComponent(workspaceId)}/runtime-services/${action}`),
      sanitizeWorkspaceRuntimeControlTarget(target),
    ),
  controlWorkspaceCommands: (
    projectId: string,
    workspaceId: string,
    action: "start" | "stop" | "restart" | "run",
    companyId?: string,
    target: WorkspaceRuntimeControlTarget = {},
  ) =>
    api.post<{ workspace: ProjectWorkspace; operation: WorkspaceOperation }>(
      projectPath(projectId, companyId, `/workspaces/${encodeURIComponent(workspaceId)}/runtime-commands/${action}`),
      sanitizeWorkspaceRuntimeControlTarget(target),
    ),
  removeWorkspace: (projectId: string, workspaceId: string, companyId?: string) =>
    api.delete<ProjectWorkspace>(projectPath(projectId, companyId, `/workspaces/${encodeURIComponent(workspaceId)}`)),
  remove: (id: string, companyId?: string) => api.delete<Project>(projectPath(id, companyId)),
};
