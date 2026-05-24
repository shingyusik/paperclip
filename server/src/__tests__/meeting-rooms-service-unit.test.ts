import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildMeetingAgentResponseMessageBody, meetingRoomService } from "../services/meeting-rooms.js";

const mockLogActivity = vi.hoisted(() => vi.fn());

vi.mock("../services/activity-log.js", () => ({
  logActivity: mockLogActivity,
}));

function createServiceDbMock(options: {
  selectRows?: unknown[][];
  insertResult?: (values: unknown) => unknown;
  updateResult?: (patch: Record<string, unknown>) => unknown;
} = {}) {
  const selectRows = [...(options.selectRows ?? [])];
  const insertedValues: unknown[] = [];
  const updatePatches: Record<string, unknown>[] = [];
  const db: any = {
    transaction: vi.fn(async (fn) => fn(db)),
    execute: vi.fn(() => Promise.resolve([])),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve(selectRows.shift() ?? [])),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn((values: unknown) => {
        insertedValues.push(values);
        return {
          returning: vi.fn(() => Promise.resolve([
            options.insertResult?.(values) ?? { id: "inserted", ...(Array.isArray(values) ? values[0] : values) },
          ])),
        };
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn((patch: Record<string, unknown>) => {
        updatePatches.push(patch);
        return {
          where: vi.fn(() => ({
            returning: vi.fn(() => Promise.resolve([
              options.updateResult?.(patch) ?? { id: "updated", companyId: "company-1", ...patch },
            ])),
          })),
        };
      }),
    })),
  };

  return { db, insertedValues, updatePatches };
}

describe("meetingRoomService unit behavior", () => {
  beforeEach(() => {
    mockLogActivity.mockReset();
  });

  it("derives redacted meeting agent response bodies from run result fields in priority order", () => {
    const derived = buildMeetingAgentResponseMessageBody({
      outputSummary: "Output fallback",
      message: "Message fallback",
      summary: 'Final answer includes "api_key":"sk-test-secret"',
    });

    expect(derived).toBe('Final answer includes "api_key":"***REDACTED***"');
  });

  it("rejects create requests with agent participants from another company before inserting", async () => {
    const { db } = createServiceDbMock({
      selectRows: [[]],
    });
    const svc = meetingRoomService(db);

    await expect(
      svc.create("company-1", {
        title: "Bad invite",
        participants: [
          {
            participantType: "agent",
            agentId: "77777777-7777-4777-8777-777777777777",
          },
        ],
      }),
    ).rejects.toMatchObject({
      status: 422,
      message: "Meeting participant agent does not belong to this company",
    });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("sets closed, open, and archived lifecycle timestamp patches", async () => {
    const existingRoom = {
      id: "room-1",
      companyId: "company-1",
      status: "open",
      closedAt: null,
      archivedAt: null,
    };
    const { db, updatePatches } = createServiceDbMock({
      selectRows: [[existingRoom], [{ ...existingRoom, closedAt: new Date("2026-01-01T00:00:00Z") }], [existingRoom]],
    });
    const svc = meetingRoomService(db);

    await svc.update("company-1", "room-1", { status: "closed" });
    await svc.update("company-1", "room-1", { status: "open" });
    await svc.update("company-1", "room-1", { status: "archived" });

    expect(updatePatches[0]).toEqual(expect.objectContaining({
      status: "closed",
      closedAt: expect.any(Date),
      archivedAt: null,
    }));
    expect(updatePatches[1]).toEqual(expect.objectContaining({
      status: "open",
      closedAt: null,
      archivedAt: null,
    }));
    expect(updatePatches[2]).toEqual(expect.objectContaining({
      status: "archived",
      closedAt: expect.any(Date),
      archivedAt: expect.any(Date),
    }));
  });

  it("rejects non-system messages to closed rooms before inserting transcript rows", async () => {
    const { db } = createServiceDbMock({
      selectRows: [[{ id: "room-1", companyId: "company-1", status: "closed" }]],
    });
    const svc = meetingRoomService(db);

    await expect(
      svc.postMessage("company-1", "room-1", {
        messageType: "user",
        authorUserId: "board-user",
        body: "Blocked",
      }),
    ).rejects.toMatchObject({
      status: 409,
      message: "Cannot post non-system messages to closed, paused, or archived meeting rooms",
    });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("allows system messages to closed rooms and updates room last-message metadata", async () => {
    const createdAt = new Date("2026-01-01T00:00:00Z");
    const { db, insertedValues, updatePatches } = createServiceDbMock({
      selectRows: [
        [{ id: "room-1", companyId: "company-1", status: "closed" }],
        [{ nextSequence: 3 }],
      ],
      insertResult: (values) => ({ id: "message-1", createdAt, ...(values as Record<string, unknown>) }),
    });
    const svc = meetingRoomService(db);

    const message = await svc.postMessage("company-1", "room-1", {
      messageType: "system",
      body: "Closed by board",
    });

    expect(message).toEqual(expect.objectContaining({
      id: "message-1",
      sequence: 3,
      messageType: "system",
    }));
    expect(insertedValues[0]).toEqual(expect.objectContaining({
      companyId: "company-1",
      roomId: "room-1",
      sequence: 3,
      body: "Closed by board",
    }));
    expect(updatePatches[0]).toEqual(expect.objectContaining({
      lastMessageId: "message-1",
      lastMessageAt: createdAt,
    }));
  });

  it("resolves only active agent participants inside the requested room and company", async () => {
    const room = {
      id: "room-1",
      companyId: "company-1",
      status: "open",
      issueId: "issue-1",
      projectId: "project-1",
      projectDocumentId: "document-1",
    };
    const participant = {
      id: "participant-1",
      companyId: "company-1",
      roomId: "room-1",
      participantType: "agent",
      agentId: "agent-1",
      status: "invited",
    };
    const { db } = createServiceDbMock({
      selectRows: [[room], [participant]],
    });
    const svc = meetingRoomService(db);

    await expect(
      svc.resolveInvokableAgentParticipant("company-1", "room-1", "participant-1"),
    ).resolves.toEqual({ room, participant });
  });

  it("rejects non-agent, left, and missing-agent participants before invocation", async () => {
    const room = { id: "room-1", companyId: "company-1", status: "open" };

    await expect(
      meetingRoomService(createServiceDbMock({
        selectRows: [[room], [{ id: "participant-1", participantType: "user", status: "active", agentId: null }]],
      }).db).resolveInvokableAgentParticipant("company-1", "room-1", "participant-1"),
    ).rejects.toMatchObject({
      status: 422,
      message: "Meeting participant invocation requires an agent participant",
    });

    await expect(
      meetingRoomService(createServiceDbMock({
        selectRows: [[room], [{ id: "participant-1", participantType: "agent", status: "left", agentId: "agent-1" }]],
      }).db).resolveInvokableAgentParticipant("company-1", "room-1", "participant-1"),
    ).rejects.toMatchObject({
      status: 422,
      message: "Cannot invoke a participant that has left or is disabled",
    });

    await expect(
      meetingRoomService(createServiceDbMock({
        selectRows: [[room], [{ id: "participant-1", participantType: "agent", status: "active", agentId: null }]],
      }).db).resolveInvokableAgentParticipant("company-1", "room-1", "participant-1"),
    ).rejects.toMatchObject({
      status: 422,
      message: "Meeting participant invocation requires an agent id",
    });
  });

  it("updates participant invocation bookkeeping only for the requested room and company", async () => {
    const { db, updatePatches } = createServiceDbMock();
    const svc = meetingRoomService(db);

    await svc.recordParticipantInvocation("company-1", "room-1", "participant-1", "run-1");

    expect(updatePatches[0]).toEqual(expect.objectContaining({
      lastInvokedRunId: "run-1",
      updatedAt: expect.any(Date),
    }));
    expect(db.update).toHaveBeenCalledTimes(1);
  });

  it("records an eligible run response as an agent_response transcript message", async () => {
    const createdAt = new Date("2026-01-01T00:00:00Z");
    const { db, insertedValues, updatePatches } = createServiceDbMock({
      selectRows: [
        [{ id: "room-1", companyId: "company-1", status: "open" }],
        [],
        [{
          id: "participant-1",
          companyId: "company-1",
          roomId: "room-1",
          participantType: "agent",
          agentId: "agent-1",
          status: "active",
        }],
        [{ nextSequence: 4 }],
      ],
      insertResult: (values) => ({ id: "message-1", createdAt, ...(values as Record<string, unknown>) }),
    });
    const svc = meetingRoomService(db);

    const message = await svc.recordAgentRunResponseMessage({
      id: "run-1",
      companyId: "company-1",
      agentId: "agent-1",
      status: "succeeded",
      contextSnapshot: {
        meetingRoomId: "room-1",
        meetingParticipantId: "participant-1",
      },
      resultJson: {
        result: 'Done with "token":"secret-value"',
      },
    } as any);

    expect(message).toEqual(expect.objectContaining({
      id: "message-1",
      messageType: "agent_response",
      format: "markdown",
      sequence: 4,
      body: 'Done with "token":"***REDACTED***"',
      authorAgentId: "agent-1",
      authorParticipantId: "participant-1",
      sourceRunId: "run-1",
    }));
    expect(insertedValues[0]).toEqual(expect.objectContaining({
      companyId: "company-1",
      roomId: "room-1",
      messageType: "agent_response",
      sourceRunId: "run-1",
    }));
    expect(updatePatches[0]).toEqual(expect.objectContaining({
      lastMessageId: "message-1",
      lastMessageAt: createdAt,
    }));
    expect(mockLogActivity).toHaveBeenCalledWith(db, expect.objectContaining({
      companyId: "company-1",
      actorType: "agent",
      actorId: "agent-1",
      action: "meeting_room.agent_responded",
      entityType: "meeting_room",
      entityId: "room-1",
      agentId: "agent-1",
      runId: "run-1",
    }));
  });

  it("skips ineligible or duplicate run response messages without inserting", async () => {
    const baseRun = {
      id: "run-1",
      companyId: "company-1",
      agentId: "agent-1",
      status: "succeeded",
      contextSnapshot: {
        meetingRoomId: "room-1",
        meetingParticipantId: "participant-1",
      },
      resultJson: { summary: "Done" },
    } as any;

    const failed = createServiceDbMock();
    await expect(
      meetingRoomService(failed.db).recordAgentRunResponseMessage({ ...baseRun, status: "failed" }),
    ).resolves.toBeNull();
    expect(failed.db.transaction).not.toHaveBeenCalled();

    const noContext = createServiceDbMock();
    await expect(
      meetingRoomService(noContext.db).recordAgentRunResponseMessage({ ...baseRun, contextSnapshot: {} }),
    ).resolves.toBeNull();
    expect(noContext.db.transaction).not.toHaveBeenCalled();

    const closedRoom = createServiceDbMock({
      selectRows: [[{ id: "room-1", companyId: "company-1", status: "closed" }]],
    });
    await expect(meetingRoomService(closedRoom.db).recordAgentRunResponseMessage(baseRun)).resolves.toBeNull();
    expect(closedRoom.db.insert).not.toHaveBeenCalled();

    const existingMessage = { id: "message-1", sourceRunId: "run-1", roomId: "room-1" };
    const duplicate = createServiceDbMock({
      selectRows: [[{ id: "room-1", companyId: "company-1", status: "open" }], [existingMessage]],
    });
    await expect(meetingRoomService(duplicate.db).recordAgentRunResponseMessage(baseRun)).resolves.toBe(existingMessage);
    expect(duplicate.db.insert).not.toHaveBeenCalled();

    const mismatchedParticipant = createServiceDbMock({
      selectRows: [
        [{ id: "room-1", companyId: "company-1", status: "open" }],
        [],
        [{ id: "participant-1", participantType: "agent", agentId: "other-agent", status: "active" }],
      ],
    });
    await expect(meetingRoomService(mismatchedParticipant.db).recordAgentRunResponseMessage(baseRun)).resolves.toBeNull();
    expect(mismatchedParticipant.db.insert).not.toHaveBeenCalled();
    expect(mockLogActivity).not.toHaveBeenCalled();
  });
});
