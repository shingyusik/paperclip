// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Project, ProjectDocument } from "@paperclipai/shared";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectDetail } from "./ProjectDetail";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockProjectsApi = vi.hoisted(() => ({
  get: vi.fn(),
  list: vi.fn(),
  update: vi.fn(),
  listDocuments: vi.fn(),
  getDocument: vi.fn(),
  upsertDocument: vi.fn(),
  listDocumentRevisions: vi.fn(),
  restoreDocumentRevision: vi.fn(),
  lockDocument: vi.fn(),
  unlockDocument: vi.fn(),
}));
const mockIssuesApi = vi.hoisted(() => ({
  list: vi.fn(),
  update: vi.fn(),
}));
const mockAgentsApi = vi.hoisted(() => ({ list: vi.fn() }));
const mockHeartbeatsApi = vi.hoisted(() => ({ liveRunsForCompany: vi.fn() }));
const mockBudgetsApi = vi.hoisted(() => ({ overview: vi.fn(), upsertPolicy: vi.fn() }));
const mockExecutionWorkspacesApi = vi.hoisted(() => ({ list: vi.fn() }));
const mockInstanceSettingsApi = vi.hoisted(() => ({ getExperimental: vi.fn() }));
const mockAssetsApi = vi.hoisted(() => ({ uploadImage: vi.fn() }));
const mockNavigate = vi.hoisted(() => vi.fn());
const mockSetBreadcrumbs = vi.hoisted(() => vi.fn());
const mockIssuesList = vi.hoisted(() => vi.fn());
const mockRouteState = vi.hoisted(() => ({
  pathname: "/projects/project-1/plugin-operations",
  search: "",
}));

vi.mock("../api/projects", () => ({ projectsApi: mockProjectsApi }));
vi.mock("../api/issues", () => ({ issuesApi: mockIssuesApi }));
vi.mock("../api/agents", () => ({ agentsApi: mockAgentsApi }));
vi.mock("../api/heartbeats", () => ({ heartbeatsApi: mockHeartbeatsApi }));
vi.mock("../api/budgets", () => ({ budgetsApi: mockBudgetsApi }));
vi.mock("../api/execution-workspaces", () => ({ executionWorkspacesApi: mockExecutionWorkspacesApi }));
vi.mock("../api/instanceSettings", () => ({ instanceSettingsApi: mockInstanceSettingsApi }));
vi.mock("../api/assets", () => ({ assetsApi: mockAssetsApi }));

vi.mock("@/lib/router", () => ({
  Link: ({ children, to }: { children?: ReactNode; to: string }) => <a href={to}>{children}</a>,
  Navigate: ({ to }: { to: string }) => <div data-testid="navigate">{to}</div>,
  useLocation: () => ({ pathname: mockRouteState.pathname, search: mockRouteState.search, hash: "", state: null }),
  useNavigate: () => mockNavigate,
  useParams: () => ({ projectId: "project-1" }),
}));

vi.mock("../context/CompanyContext", () => ({
  useCompany: () => ({
    companies: [{ id: "company-1", issuePrefix: "PAP" }],
    selectedCompanyId: "company-1",
    setSelectedCompanyId: vi.fn(),
  }),
}));
vi.mock("../context/PanelContext", () => ({ usePanel: () => ({ closePanel: vi.fn() }) }));
vi.mock("../context/ToastContext", () => ({ useToastActions: () => ({ pushToast: vi.fn() }) }));
vi.mock("../context/BreadcrumbContext", () => ({ useBreadcrumbs: () => ({ setBreadcrumbs: mockSetBreadcrumbs }) }));
vi.mock("@/plugins/slots", () => ({
  PluginSlotMount: () => null,
  PluginSlotOutlet: () => null,
  usePluginSlots: () => ({ slots: [], isLoading: false }),
}));
vi.mock("@/plugins/launchers", () => ({ PluginLauncherOutlet: () => null }));
vi.mock("../components/ProjectProperties", () => ({
  ProjectProperties: () => <div data-testid="project-properties" />,
}));
vi.mock("../components/BudgetPolicyCard", () => ({
  BudgetPolicyCard: () => <div data-testid="budget-policy-card" />,
}));
vi.mock("../components/InlineEditor", () => ({
  InlineEditor: ({ value, placeholder }: { value?: string; placeholder?: string }) => (
    <span>{value || placeholder || null}</span>
  ),
}));
vi.mock("../components/ProjectWorkspacesContent", () => ({
  ProjectWorkspacesContent: () => <div data-testid="project-workspaces" />,
}));
vi.mock("../components/PageTabBar", () => ({
  PageTabBar: ({ items, onValueChange }: {
    items: Array<{ value: string; label: string }>;
    onValueChange?: (value: string) => void;
  }) => (
    <div>
      {items.map((item) => (
        <button key={item.value} onClick={() => onValueChange?.(item.value)}>
          {item.label}
        </button>
      ))}
    </div>
  ),
}));
vi.mock("../components/IssuesList", () => ({
  IssuesList: (props: unknown) => {
    mockIssuesList(props);
    return <div data-testid="issues-list" />;
  },
}));

function project(overrides: Partial<Project> = {}): Project {
  const now = new Date("2026-05-01T00:00:00Z");
  return {
    id: "project-1",
    companyId: "company-1",
    urlKey: "project-1",
    goalId: null,
    goalIds: [],
    goals: [],
    name: "Managed Project",
    description: null,
    status: "in_progress",
    leadAgentId: null,
    targetDate: null,
    color: "#14b8a6",
    env: null,
    pauseReason: null,
    pausedAt: null,
    executionWorkspacePolicy: null,
    codebase: {
      workspaceId: null,
      repoUrl: null,
      repoRef: null,
      defaultRef: null,
      repoName: null,
      localFolder: null,
      managedFolder: "/tmp/project-1",
      effectiveLocalFolder: "/tmp/project-1",
      origin: "managed_checkout",
    },
    workspaces: [],
    primaryWorkspace: null,
    managedByPlugin: {
      id: "managed-1",
      pluginId: "plugin-1",
      pluginKey: "paperclip.missions",
      pluginDisplayName: "Missions",
      resourceKind: "project",
      resourceKey: "operations",
      defaultsJson: {},
      createdAt: now,
      updatedAt: now,
    },
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function projectDocument(overrides: Partial<ProjectDocument> = {}): ProjectDocument {
  const now = new Date("2026-05-01T00:00:00Z");
  return {
    id: "document-roadmap",
    companyId: "company-1",
    projectId: "project-1",
    key: "roadmap",
    title: "Roadmap",
    format: "markdown",
    body: "# Roadmap\n\n- Milestone 1",
    latestRevisionId: "revision-1",
    latestRevisionNumber: 1,
    createdByAgentId: null,
    createdByUserId: "user-1",
    updatedByAgentId: null,
    updatedByUserId: "user-1",
    lockedAt: null,
    lockedByAgentId: null,
    lockedByUserId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("ProjectDetail", () => {
  let root: Root | null = null;
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    mockRouteState.pathname = "/projects/project-1/plugin-operations";
    mockRouteState.search = "";
    mockProjectsApi.get.mockResolvedValue(project());
    mockProjectsApi.list.mockResolvedValue([project()]);
    mockProjectsApi.listDocuments.mockResolvedValue([]);
    mockProjectsApi.getDocument.mockResolvedValue(projectDocument());
    mockProjectsApi.upsertDocument.mockImplementation(async (_projectId, key, data) =>
      projectDocument({
        key,
        title: data.title ?? null,
        body: data.body,
        latestRevisionId: "revision-created",
        latestRevisionNumber: 1,
      }),
    );
    mockProjectsApi.listDocumentRevisions.mockResolvedValue([]);
    mockIssuesApi.list.mockResolvedValue([]);
    mockAgentsApi.list.mockResolvedValue([]);
    mockHeartbeatsApi.liveRunsForCompany.mockResolvedValue([]);
    mockBudgetsApi.overview.mockResolvedValue({ policies: [] });
    mockInstanceSettingsApi.getExperimental.mockResolvedValue({ enableIsolatedWorkspaces: false });
    mockExecutionWorkspacesApi.list.mockResolvedValue([]);
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    container.remove();
    vi.clearAllMocks();
  });

  it("shows managed plugin affordances and filters the operations tab by plugin origin", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    await act(async () => {
      root = createRoot(container);
      root.render(
        <QueryClientProvider client={queryClient}>
          <ProjectDetail />
        </QueryClientProvider>,
      );
    });
    await flush();

    expect(container.textContent).toContain("Managed by Missions");
    expect(container.textContent).toContain("Plugin operations");
    expect(mockIssuesApi.list).toHaveBeenCalledWith("company-1", {
      projectId: "project-1",
      originKindPrefix: "plugin:paperclip.missions",
    });
  });

  it("shows Roadmap and Documents tabs in the project tab bar", async () => {
    mockRouteState.pathname = "/projects/project-1/issues";
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    await act(async () => {
      root = createRoot(container);
      root.render(
        <QueryClientProvider client={queryClient}>
          <ProjectDetail />
        </QueryClientProvider>,
      );
    });
    await flush();

    expect(container.textContent).toContain("Roadmap");
    expect(container.textContent).toContain("Documents");
  });

  it("loads the roadmap project document on the Roadmap tab", async () => {
    mockRouteState.pathname = "/projects/project-1/roadmap";
    mockProjectsApi.getDocument.mockResolvedValue(projectDocument({
      body: "# Project Roadmap\n\n- First milestone",
    }));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    await act(async () => {
      root = createRoot(container);
      root.render(
        <QueryClientProvider client={queryClient}>
          <ProjectDetail />
        </QueryClientProvider>,
      );
    });
    await flush();

    expect(mockProjectsApi.getDocument).toHaveBeenCalledWith("project-1", "roadmap", "company-1");
    expect(container.textContent).toContain("# Project Roadmap");
    expect(container.textContent).toContain("First milestone");
  });

  it("lists all project documents on the Documents tab", async () => {
    mockRouteState.pathname = "/projects/project-1/documents";
    mockProjectsApi.listDocuments.mockResolvedValue([
      projectDocument({ key: "roadmap", title: "Roadmap", body: "# Roadmap" }),
      projectDocument({ id: "document-spec", key: "spec", title: "Spec", body: "# Spec" }),
      projectDocument({ id: "document-decisions", key: "decisions", title: "Decisions", body: "# Decisions" }),
    ]);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    await act(async () => {
      root = createRoot(container);
      root.render(
        <QueryClientProvider client={queryClient}>
          <ProjectDetail />
        </QueryClientProvider>,
      );
    });
    await flush();

    expect(mockProjectsApi.listDocuments).toHaveBeenCalledWith("project-1", "company-1");
    expect(container.textContent).toContain("Roadmap");
    expect(container.textContent).toContain("Spec");
    expect(container.textContent).toContain("Decisions");
    expect(container.textContent).toContain("# Roadmap");
  });

  it("creates an empty roadmap document from the Roadmap tab CTA", async () => {
    mockRouteState.pathname = "/projects/project-1/roadmap";
    mockProjectsApi.getDocument.mockResolvedValue(null);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    await act(async () => {
      root = createRoot(container);
      root.render(
        <QueryClientProvider client={queryClient}>
          <ProjectDetail />
        </QueryClientProvider>,
      );
    });
    await flush();

    const createButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("Create roadmap"));
    expect(createButton).toBeTruthy();

    await act(async () => {
      createButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();

    expect(mockProjectsApi.upsertDocument).toHaveBeenCalledWith("project-1", "roadmap", {
      title: "Roadmap",
      format: "markdown",
      body: "# Roadmap\n\n",
      baseRevisionId: null,
    }, "company-1");
  });
});
