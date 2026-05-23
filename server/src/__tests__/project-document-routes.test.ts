import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import express from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const projectId = "11111111-1111-4111-8111-111111111111";
const companyId = "22222222-2222-4222-8222-222222222222";

const mockProjectService = vi.hoisted(() => ({
  list: vi.fn(),
  getById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  createWorkspace: vi.fn(),
  listWorkspaces: vi.fn(),
  updateWorkspace: vi.fn(),
  removeWorkspace: vi.fn(),
  remove: vi.fn(),
  resolveByReference: vi.fn(),
}));

const mockDocumentsService = vi.hoisted(() => ({
  listProjectDocuments: vi.fn(),
  getProjectDocumentByKey: vi.fn(),
  upsertProjectDocument: vi.fn(),
}));

const mockSecretService = vi.hoisted(() => ({
  normalizeEnvBindingsForPersistence: vi.fn(),
}));
const mockEnvironmentService = vi.hoisted(() => ({
  getById: vi.fn(),
}));
const mockWorkspaceOperationService = vi.hoisted(() => ({}));
const mockLogActivity = vi.hoisted(() => vi.fn());
const mockGetTelemetryClient = vi.hoisted(() => vi.fn());

function registerModuleMocks() {
  vi.doMock("../telemetry.js", () => ({
    getTelemetryClient: mockGetTelemetryClient,
  }));

  vi.doMock("../services/index.js", () => ({
    documentService: () => mockDocumentsService,
    environmentService: () => mockEnvironmentService,
    logActivity: mockLogActivity,
    projectService: () => mockProjectService,
    secretService: () => mockSecretService,
    workspaceOperationService: () => mockWorkspaceOperationService,
  }));

  vi.doMock("../services/environments.js", () => ({
    environmentService: () => mockEnvironmentService,
  }));

  vi.doMock("../services/secrets.js", () => ({
    secretService: () => mockSecretService,
  }));

  vi.doMock("../services/workspace-runtime.js", () => ({
    startRuntimeServicesForWorkspaceControl: vi.fn(),
    stopRuntimeServicesForProjectWorkspace: vi.fn(),
  }));
}

async function createApp() {
  const [{ projectRoutes }, { errorHandler }] = await Promise.all([
    vi.importActual<typeof import("../routes/projects.js")>("../routes/projects.js"),
    vi.importActual<typeof import("../middleware/index.js")>("../middleware/index.js"),
  ]);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = {
      type: "board",
      userId: "board-user",
      companyIds: [companyId],
      source: "local_implicit",
      isInstanceAdmin: false,
    };
    next();
  });
  app.use("/api", projectRoutes({} as any));
  app.use(errorHandler);
  return app;
}

async function injectJson(
  app: express.Express,
  method: string,
  url: string,
  body?: Record<string, unknown>,
) {
  const socket = new Socket();
  const req = new IncomingMessage(socket);
  req.method = method;
  req.url = url;
  const payload = body === undefined ? null : JSON.stringify(body);
  req.headers = {
    accept: "application/json",
    ...(payload ? {
      "content-type": "application/json",
      "content-length": String(Buffer.byteLength(payload)),
    } : {}),
  };

  const res = new ServerResponse(req);
  const chunks: Buffer[] = [];

  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    res.write = ((chunk: unknown, encodingOrCallback?: BufferEncoding | ((error?: Error | null) => void), callback?: (error?: Error | null) => void) => {
      if (chunk) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      }
      const cb = typeof encodingOrCallback === "function" ? encodingOrCallback : callback;
      cb?.();
      return true;
    }) as typeof res.write;

    res.end = ((chunk?: unknown, encodingOrCallback?: BufferEncoding | (() => void), callback?: () => void) => {
      if (chunk) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      }
      const cb = typeof encodingOrCallback === "function" ? encodingOrCallback : callback;
      cb?.();
      const rawBody = Buffer.concat(chunks).toString("utf8");
      try {
        resolve({
          status: res.statusCode,
          body: rawBody ? JSON.parse(rawBody) : null,
        });
      } catch (error) {
        reject(error);
      }
      return res;
    }) as typeof res.end;

    app.handle(req, res, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({ status: 404, body: null });
    });
    if (payload) {
      req.push(payload);
    }
    req.push(null);
  });
}

describe("project document routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("../routes/projects.js");
    vi.doUnmock("../routes/authz.js");
    vi.doUnmock("../middleware/index.js");
    vi.doUnmock("../services/environments.js");
    vi.doUnmock("../services/secrets.js");
    registerModuleMocks();
    vi.clearAllMocks();
    mockGetTelemetryClient.mockReturnValue({ track: vi.fn() });
    mockProjectService.resolveByReference.mockResolvedValue({ ambiguous: false, project: null });
    mockProjectService.getById.mockResolvedValue({
      id: projectId,
      companyId,
      name: "Launch",
      status: "in_progress",
    });
    mockDocumentsService.listProjectDocuments.mockResolvedValue([
      {
        id: "document-1",
        companyId,
        projectId,
        key: "roadmap",
        title: "Roadmap",
        format: "markdown",
        body: "# Roadmap",
        latestRevisionId: "33333333-3333-4333-8333-333333333333",
        latestRevisionNumber: 1,
      },
    ]);
    mockDocumentsService.getProjectDocumentByKey.mockResolvedValue({
      id: "document-1",
      companyId,
      projectId,
      key: "roadmap",
      title: "Roadmap",
      format: "markdown",
      body: "# Roadmap",
      latestRevisionId: "33333333-3333-4333-8333-333333333333",
      latestRevisionNumber: 1,
    });
    mockDocumentsService.upsertProjectDocument.mockResolvedValue({
      created: false,
      document: {
        id: "document-1",
        companyId,
        projectId,
        key: "roadmap",
        title: "Roadmap",
        format: "markdown",
        body: "# Roadmap v2",
        latestRevisionId: "44444444-4444-4444-8444-444444444444",
        latestRevisionNumber: 2,
      },
    });
  });

  it("rejects invalid project document keys with a 400", async () => {
    const res = await injectJson(await createApp(), "GET", `/api/projects/${projectId}/documents/notes`);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid document key");
    expect(mockDocumentsService.getProjectDocumentByKey).not.toHaveBeenCalled();
  });

  it("lists and fetches project documents", async () => {
    const app = await createApp();

    const listRes = await injectJson(app, "GET", `/api/projects/${projectId}/documents`);
    expect(listRes.status).toBe(200);
    expect(listRes.body).toEqual([expect.objectContaining({ key: "roadmap", body: "# Roadmap" })]);
    expect(mockDocumentsService.listProjectDocuments).toHaveBeenCalledWith(projectId);

    const getRes = await injectJson(app, "GET", `/api/projects/${projectId}/documents/roadmap`);
    expect(getRes.status).toBe(200);
    expect(getRes.body).toEqual(expect.objectContaining({ key: "roadmap", body: "# Roadmap" }));
    expect(mockDocumentsService.getProjectDocumentByKey).toHaveBeenCalledWith(projectId, "roadmap");
  });

  it("upserts project documents and logs project document activity", async () => {
    const res = await injectJson(
      await createApp(),
      "PUT",
      `/api/projects/${projectId}/documents/roadmap`,
      {
        title: "Roadmap",
        format: "markdown",
        body: "# Roadmap v2",
        baseRevisionId: "33333333-3333-4333-8333-333333333333",
      },
    );

    expect(res.status).toBe(200);
    expect(mockDocumentsService.upsertProjectDocument).toHaveBeenCalledWith({
      projectId,
      key: "roadmap",
      title: "Roadmap",
      format: "markdown",
      body: "# Roadmap v2",
      changeSummary: null,
      baseRevisionId: "33333333-3333-4333-8333-333333333333",
      createdByAgentId: null,
      createdByUserId: "board-user",
      createdByRunId: null,
    });
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        companyId,
        action: "project.document_updated",
        entityType: "project",
        entityId: projectId,
        details: expect.objectContaining({
          key: "roadmap",
          documentId: "document-1",
          revisionNumber: 2,
        }),
      }),
    );
  });
});
