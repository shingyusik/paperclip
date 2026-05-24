import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import express from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const companyId = "22222222-2222-4222-8222-222222222222";
const roomId = "33333333-3333-4333-8333-333333333333";
const participantId = "44444444-4444-4444-8444-444444444444";
const messageId = "55555555-5555-4555-8555-555555555555";
const summaryId = "66666666-6666-4666-8666-666666666666";
const agentId = "77777777-7777-4777-8777-777777777777";
const runId = "88888888-8888-4888-8888-888888888888";
const projectId = "99999999-9999-4999-8999-999999999998";
const issueId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const projectDocumentId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const mockMeetingRoomService = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  getDetails: vi.fn(),
  update: vi.fn(),
  addParticipant: vi.fn(),
  removeParticipant: vi.fn(),
  listMessages: vi.fn(),
  postMessage: vi.fn(),
  createSummary: vi.fn(),
  updateSummary: vi.fn(),
  resolveInvokableAgentParticipant: vi.fn(),
  recordParticipantInvocation: vi.fn(),
}));
const mockLogActivity = vi.hoisted(() => vi.fn());
const mockHeartbeatService = vi.hoisted(() => ({
  wakeup: vi.fn(),
}));
const mockAccessService = vi.hoisted(() => ({
  canUser: vi.fn(),
}));

function registerModuleMocks() {
  vi.doMock("../services/index.js", () => ({
    accessService: () => mockAccessService,
    heartbeatService: () => mockHeartbeatService,
    logActivity: mockLogActivity,
    meetingRoomService: () => mockMeetingRoomService,
  }));
}

async function createApp(actor: Record<string, unknown> = {
  type: "board",
  userId: "board-user",
  companyIds: [companyId],
  source: "local_implicit",
  isInstanceAdmin: false,
}) {
  const [{ meetingRoomRoutes }, { errorHandler }] = await Promise.all([
    vi.importActual<typeof import("../routes/meeting-rooms.js")>("../routes/meeting-rooms.js"),
    vi.importActual<typeof import("../middleware/index.js")>("../middleware/index.js"),
  ]);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = actor;
    next();
  });
  app.use("/api", meetingRoomRoutes({} as any));
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
    ...(payload
      ? {
        "content-type": "application/json",
        "content-length": String(Buffer.byteLength(payload)),
      }
      : {}),
  };

  const res = new ServerResponse(req);
  const chunks: Buffer[] = [];

  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    res.write = ((
      chunk: unknown,
      encodingOrCallback?: BufferEncoding | ((error?: Error | null) => void),
      callback?: (error?: Error | null) => void,
    ) => {
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

describe("meeting room routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("../routes/meeting-rooms.js");
    vi.doUnmock("../routes/authz.js");
    vi.doUnmock("../middleware/index.js");
    registerModuleMocks();
    vi.clearAllMocks();
    mockMeetingRoomService.list.mockResolvedValue([
      { id: roomId, companyId, title: "Launch sync", status: "open" },
    ]);
    mockMeetingRoomService.create.mockResolvedValue({
      room: { id: roomId, companyId, title: "Launch sync", status: "open" },
      participants: [{ id: participantId, roomId, companyId, agentId }],
    });
    mockMeetingRoomService.getDetails.mockResolvedValue({
      room: { id: roomId, companyId, title: "Launch sync", status: "open" },
      participants: [{ id: participantId, roomId, companyId, agentId }],
      latestSummary: { id: summaryId, status: "draft", summaryKind: "recap" },
    });
    mockMeetingRoomService.update.mockResolvedValue({ id: roomId, companyId, status: "closed" });
    mockMeetingRoomService.addParticipant.mockResolvedValue({ id: participantId, roomId, companyId, agentId });
    mockMeetingRoomService.removeParticipant.mockResolvedValue({ id: participantId, roomId, status: "left" });
    mockMeetingRoomService.listMessages.mockResolvedValue([
      { id: messageId, roomId, companyId, sequence: 1, body: "First" },
    ]);
    mockMeetingRoomService.postMessage.mockResolvedValue({
      id: messageId,
      roomId,
      companyId,
      sequence: 1,
      body: "First",
    });
    mockMeetingRoomService.createSummary.mockResolvedValue({
      id: summaryId,
      roomId,
      companyId,
      summaryKind: "recap",
      status: "draft",
    });
    mockMeetingRoomService.updateSummary.mockResolvedValue({
      id: summaryId,
      roomId,
      companyId,
      summaryKind: "recap",
      status: "accepted",
    });
    mockMeetingRoomService.resolveInvokableAgentParticipant.mockResolvedValue({
      room: {
        id: roomId,
        companyId,
        status: "open",
        projectId,
        issueId,
        projectDocumentId,
      },
      participant: {
        id: participantId,
        roomId,
        companyId,
        participantType: "agent",
        agentId,
        status: "invited",
      },
    });
    mockMeetingRoomService.recordParticipantInvocation.mockResolvedValue(undefined);
    mockHeartbeatService.wakeup.mockResolvedValue({
      id: runId,
      companyId,
      agentId,
      status: "queued",
    });
    mockAccessService.canUser.mockResolvedValue(true);
  });

  it("lists rooms with validated query filters and enforces company access", async () => {
    const app = await createApp();

    const res = await injectJson(
      app,
      "GET",
      `/api/companies/${companyId}/meeting-rooms?status=open&participantId=${participantId}&limit=5&offset=2`,
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual([expect.objectContaining({ id: roomId, status: "open" })]);
    expect(mockMeetingRoomService.list).toHaveBeenCalledWith(companyId, {
      status: "open",
      participantId,
      limit: 5,
      offset: 2,
    });
  });

  it("rejects invalid list query values before calling the service", async () => {
    const res = await injectJson(await createApp(), "GET", `/api/companies/${companyId}/meeting-rooms?limit=101`);

    expect(res.status).toBe(400);
    expect(mockMeetingRoomService.list).not.toHaveBeenCalled();
  });

  it("creates rooms with participants and logs the mutation", async () => {
    const res = await injectJson(await createApp(), "POST", `/api/companies/${companyId}/meeting-rooms`, {
      title: "  Launch sync  ",
      participants: [
        {
          participantType: "agent",
          agentId,
          role: "member",
        },
      ],
    });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      room: expect.objectContaining({ id: roomId, title: "Launch sync" }),
      participants: [expect.objectContaining({ id: participantId, agentId })],
    });
    expect(mockMeetingRoomService.create).toHaveBeenCalledWith(companyId, {
      title: "Launch sync",
      status: "open",
      originKind: "user_created",
      participants: [
        expect.objectContaining({
          participantType: "agent",
          agentId,
          role: "member",
          status: "invited",
        }),
      ],
    });
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        companyId,
        action: "meeting_room.created",
        entityType: "meeting_room",
        entityId: roomId,
      }),
    );
  });

  it("fetches details, updates status, and logs status mutations", async () => {
    const app = await createApp();

    const getRes = await injectJson(app, "GET", `/api/companies/${companyId}/meeting-rooms/${roomId}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body).toEqual(expect.objectContaining({
      room: expect.objectContaining({ id: roomId }),
      participants: [expect.objectContaining({ id: participantId })],
      latestSummary: expect.objectContaining({ id: summaryId }),
    }));
    expect(mockMeetingRoomService.getDetails).toHaveBeenCalledWith(companyId, roomId);

    const patchRes = await injectJson(app, "PATCH", `/api/companies/${companyId}/meeting-rooms/${roomId}`, {
      status: "closed",
      metadata: { decision: "ship" },
    });
    expect(patchRes.status).toBe(200);
    expect(mockMeetingRoomService.update).toHaveBeenCalledWith(companyId, roomId, {
      status: "closed",
      metadata: { decision: "ship" },
    });
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "meeting_room.updated",
        entityType: "meeting_room",
        entityId: roomId,
        details: expect.objectContaining({ changedKeys: ["metadata", "status"] }),
      }),
    );
  });

  it("adds and removes participants without invoking agents", async () => {
    const app = await createApp();

    const addRes = await injectJson(app, "POST", `/api/companies/${companyId}/meeting-rooms/${roomId}/participants`, {
      participantType: "agent",
      agentId,
      role: "observer",
    });
    expect(addRes.status).toBe(201);
    expect(mockMeetingRoomService.addParticipant).toHaveBeenCalledWith(companyId, roomId, {
      participantType: "agent",
      agentId,
      role: "observer",
      status: "invited",
    });
    expect(mockMeetingRoomService.addParticipant).toHaveBeenCalledTimes(1);
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "meeting_room.participant_added",
        entityType: "meeting_room",
        entityId: roomId,
      }),
    );

    const removeRes = await injectJson(
      app,
      "DELETE",
      `/api/companies/${companyId}/meeting-rooms/${roomId}/participants/${participantId}`,
    );
    expect(removeRes.status).toBe(200);
    expect(mockMeetingRoomService.removeParticipant).toHaveBeenCalledWith(companyId, roomId, participantId);
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "meeting_room.participant_removed",
        entityType: "meeting_room",
        entityId: roomId,
      }),
    );
  });

  it("lists and posts transcript messages with activity logging", async () => {
    const app = await createApp();

    const listRes = await injectJson(app, "GET", `/api/companies/${companyId}/meeting-rooms/${roomId}/messages?limit=10`);
    expect(listRes.status).toBe(200);
    expect(mockMeetingRoomService.listMessages).toHaveBeenCalledWith(companyId, roomId, {
      limit: 10,
      offset: 0,
    });

    const postRes = await injectJson(app, "POST", `/api/companies/${companyId}/meeting-rooms/${roomId}/messages`, {
      messageType: "user",
      authorUserId: "board-user",
      body: "First",
    });
    expect(postRes.status).toBe(201);
    expect(mockMeetingRoomService.postMessage).toHaveBeenCalledWith(companyId, roomId, {
      messageType: "user",
      authorUserId: "board-user",
      body: "First",
      format: "markdown",
    });
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "meeting_room.message_posted",
        entityType: "meeting_room",
        entityId: roomId,
      }),
    );
  });

  it("creates and updates summaries without downstream application", async () => {
    const app = await createApp();

    const createRes = await injectJson(app, "POST", `/api/companies/${companyId}/meeting-rooms/${roomId}/summaries`, {
      summaryKind: "recap",
      body: "Decided to ship.",
    });
    expect(createRes.status).toBe(201);
    expect(mockMeetingRoomService.createSummary).toHaveBeenCalledWith(companyId, roomId, {
      summaryKind: "recap",
      status: "draft",
      body: "Decided to ship.",
    });
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "meeting_room.summary_created",
        entityType: "meeting_room",
        entityId: roomId,
      }),
    );

    const updateRes = await injectJson(
      app,
      "PATCH",
      `/api/companies/${companyId}/meeting-rooms/${roomId}/summaries/${summaryId}`,
      { status: "accepted" },
    );
    expect(updateRes.status).toBe(200);
    expect(mockMeetingRoomService.updateSummary).toHaveBeenCalledWith(companyId, roomId, summaryId, {
      status: "accepted",
    });
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "meeting_room.summary_updated",
        entityType: "meeting_room",
        entityId: roomId,
      }),
    );
  });

  it("explicitly invokes an agent participant with meeting-room context and logs bookkeeping", async () => {
    const res = await injectJson(
      await createApp(),
      "POST",
      `/api/companies/${companyId}/meeting-rooms/${roomId}/participants/${participantId}/invoke`,
      {
        reason: "Please respond with the release risk.",
        idempotencyKey: "room-invoke-1",
        transcriptWindow: { limit: 8 },
        lastMessageId: messageId,
        instruction: "Focus on blockers.",
      },
    );

    expect(res.status).toBe(202);
    expect(res.body).toEqual(expect.objectContaining({ id: runId, status: "queued" }));
    expect(mockMeetingRoomService.resolveInvokableAgentParticipant).toHaveBeenCalledWith(
      companyId,
      roomId,
      participantId,
    );
    expect(mockHeartbeatService.wakeup).toHaveBeenCalledWith(agentId, {
      source: "on_demand",
      triggerDetail: "manual",
      reason: "Please respond with the release risk.",
      idempotencyKey: "room-invoke-1",
      requestedByActorType: "user",
      requestedByActorId: "board-user",
      payload: {
        meetingRoomId: roomId,
        meetingParticipantId: participantId,
        transcriptWindow: { limit: 8 },
        lastMessageId: messageId,
        instruction: "Focus on blockers.",
      },
      contextSnapshot: {
        source: "meeting_room",
        meetingRoomId: roomId,
        meetingParticipantId: participantId,
        projectId,
        issueId,
        projectDocumentId,
        triggeredBy: "board",
        actorId: "board-user",
      },
    });
    expect(mockMeetingRoomService.recordParticipantInvocation).toHaveBeenCalledWith(
      companyId,
      roomId,
      participantId,
      runId,
    );
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        companyId,
        action: "meeting_room.agent_invoked",
        entityType: "meeting_room",
        entityId: roomId,
        details: expect.objectContaining({
          participantId,
          agentId,
          runId,
        }),
      }),
    );
  });

  it("defaults the explicit participant invocation reason and returns skipped responses without bookkeeping", async () => {
    mockHeartbeatService.wakeup.mockResolvedValueOnce(null);

    const res = await injectJson(
      await createApp(),
      "POST",
      `/api/companies/${companyId}/meeting-rooms/${roomId}/participants/${participantId}/invoke`,
      {},
    );

    expect(res.status).toBe(202);
    expect(res.body).toEqual({
      status: "skipped",
      reason: "wakeup_skipped",
      message: "Wakeup was skipped.",
      meetingRoomId: roomId,
      meetingParticipantId: participantId,
      agentId,
    });
    expect(mockHeartbeatService.wakeup).toHaveBeenCalledWith(agentId, expect.objectContaining({
      reason: "Explicit meeting-room agent invocation",
      triggerDetail: "manual",
      payload: {
        meetingRoomId: roomId,
        meetingParticipantId: participantId,
      },
    }));
    expect(mockMeetingRoomService.recordParticipantInvocation).not.toHaveBeenCalled();
    expect(mockLogActivity).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "meeting_room.agent_invoked" }),
    );
  });

  it("requires board manage-agent permission for explicit participant invocation", async () => {
    mockAccessService.canUser.mockResolvedValueOnce(false);
    const app = await createApp({
      type: "board",
      userId: "member-user",
      companyIds: [companyId],
      memberships: [{ companyId, membershipRole: "member", status: "active" }],
      source: "session",
      isInstanceAdmin: false,
    });

    const res = await injectJson(
      app,
      "POST",
      `/api/companies/${companyId}/meeting-rooms/${roomId}/participants/${participantId}/invoke`,
      {},
    );

    expect(res.status).toBe(403);
    expect(mockHeartbeatService.wakeup).not.toHaveBeenCalled();
  });

  it("rejects explicit participant invocation for inactive rooms and invalid participants before wakeup", async () => {
    mockMeetingRoomService.resolveInvokableAgentParticipant.mockResolvedValueOnce({
      room: { id: roomId, companyId, status: "closed" },
      participant: { id: participantId, participantType: "agent", agentId, status: "active" },
    });

    const closedRes = await injectJson(
      await createApp(),
      "POST",
      `/api/companies/${companyId}/meeting-rooms/${roomId}/participants/${participantId}/invoke`,
      {},
    );

    expect(closedRes.status).toBe(409);
    expect(mockHeartbeatService.wakeup).not.toHaveBeenCalled();

    mockMeetingRoomService.resolveInvokableAgentParticipant.mockResolvedValueOnce({
      room: { id: roomId, companyId, status: "open" },
      participant: { id: participantId, participantType: "user", userId: "board-user", status: "active" },
    });

    const userRes = await injectJson(
      await createApp(),
      "POST",
      `/api/companies/${companyId}/meeting-rooms/${roomId}/participants/${participantId}/invoke`,
      {},
    );

    expect(userRes.status).toBe(422);
    expect(mockHeartbeatService.wakeup).not.toHaveBeenCalled();
  });

  it("denies board users without access to the requested company", async () => {
    const app = await createApp({
      type: "board",
      userId: "outsider",
      companyIds: ["99999999-9999-4999-8999-999999999999"],
      source: "session",
      isInstanceAdmin: false,
    });

    const res = await injectJson(app, "GET", `/api/companies/${companyId}/meeting-rooms`);

    expect(res.status).toBe(403);
    expect(mockMeetingRoomService.list).not.toHaveBeenCalled();
  });
});
