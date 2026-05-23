import { eq } from "drizzle-orm";
import {
  agents,
  authUsers,
  companies,
  createDb,
  meetingMessages,
  meetingParticipants,
  meetingRooms,
  meetingSummaries,
} from "@paperclipai/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { meetingRoomService } from "../services/meeting-rooms.js";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe.sequential : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres meeting room service tests on this host: ${
      embeddedPostgresSupport.reason ?? "unsupported environment"
    }`,
  );
}

const companyId = "22222222-2222-4222-8222-222222222222";
const otherCompanyId = "99999999-9999-4999-8999-999999999999";
const agentId = "77777777-7777-4777-8777-777777777777";
const otherCompanyAgentId = "88888888-8888-4888-8888-888888888888";

describeEmbeddedPostgres("meetingRoomService", () => {
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  let db!: ReturnType<typeof createDb>;

  beforeEach(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-meeting-rooms-service-");
    db = createDb(tempDb.connectionString);
    await db.insert(companies).values([
      { id: companyId, name: "Acme", issuePrefix: "ACM" },
      { id: otherCompanyId, name: "Other", issuePrefix: "OTH" },
    ]);
    const now = new Date("2026-01-01T00:00:00Z");
    await db.insert(authUsers).values({
      id: "board-user",
      name: "Board User",
      email: "board@example.test",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(agents).values([
      { id: agentId, companyId, name: "Coder", role: "engineer" },
      { id: otherCompanyAgentId, companyId: otherCompanyId, name: "Outsider", role: "engineer" },
    ]);
  });

  afterEach(async () => {
    await tempDb?.cleanup();
    tempDb = null;
  });

  it("creates a room and initial participants in one service operation", async () => {
    const svc = meetingRoomService(db);

    const created = await svc.create(companyId, {
      title: "Launch sync",
      description: "Coordinate launch",
      participants: [
        {
          participantType: "agent",
          agentId,
          role: "member",
          status: "invited",
        },
        {
          participantType: "user",
          userId: "board-user",
          role: "host",
          status: "active",
        },
      ],
    });

    expect(created.room).toEqual(expect.objectContaining({
      companyId,
      title: "Launch sync",
      status: "open",
      originKind: "user_created",
    }));
    expect(created.participants).toHaveLength(2);
    await expect(db.select().from(meetingRooms)).resolves.toHaveLength(1);
    await expect(db.select().from(meetingParticipants)).resolves.toHaveLength(2);
  });

  it("rejects participants whose agent belongs to another company", async () => {
    const svc = meetingRoomService(db);

    await expect(
      svc.create(companyId, {
        title: "Bad invite",
        participants: [
          {
            participantType: "agent",
            agentId: otherCompanyAgentId,
            role: "member",
            status: "invited",
          },
        ],
      }),
    ).rejects.toMatchObject({
      status: 422,
      message: "Meeting participant agent does not belong to this company",
    });

    await expect(db.select().from(meetingRooms)).resolves.toHaveLength(0);
    await expect(db.select().from(meetingParticipants)).resolves.toHaveLength(0);
  });

  it("sets room lifecycle timestamps consistently across status transitions", async () => {
    const svc = meetingRoomService(db);
    const { room } = await svc.create(companyId, { title: "Status sync" });

    const closed = await svc.update(companyId, room.id, { status: "closed" });
    expect(closed?.status).toBe("closed");
    expect(closed?.closedAt).toBeInstanceOf(Date);
    expect(closed?.archivedAt).toBeNull();

    const reopened = await svc.update(companyId, room.id, { status: "open" });
    expect(reopened?.status).toBe("open");
    expect(reopened?.closedAt).toBeNull();
    expect(reopened?.archivedAt).toBeNull();

    const archived = await svc.update(companyId, room.id, { status: "archived" });
    expect(archived?.status).toBe("archived");
    expect(archived?.closedAt).toBeInstanceOf(Date);
    expect(archived?.archivedAt).toBeInstanceOf(Date);
  });

  it("appends ordered messages and rejects non-system messages to closed rooms", async () => {
    const svc = meetingRoomService(db);
    const { room } = await svc.create(companyId, { title: "Transcript" });

    const first = await svc.postMessage(companyId, room.id, {
      messageType: "user",
      authorUserId: "board-user",
      body: "First",
    });
    const second = await svc.postMessage(companyId, room.id, {
      messageType: "system",
      body: "System note",
    });

    expect(first.sequence).toBe(1);
    expect(second.sequence).toBe(2);
    const [updatedRoom] = await db.select().from(meetingRooms).where(eq(meetingRooms.id, room.id));
    expect(updatedRoom.lastMessageId).toBe(second.id);
    expect(updatedRoom.lastMessageAt?.getTime()).toBe(second.createdAt.getTime());

    await svc.update(companyId, room.id, { status: "closed" });

    await expect(
      svc.postMessage(companyId, room.id, {
        messageType: "user",
        authorUserId: "board-user",
        body: "Blocked",
      }),
    ).rejects.toMatchObject({
      status: 409,
      message: "Cannot post non-system messages to closed, paused, or archived meeting rooms",
    });

    const audit = await svc.postMessage(companyId, room.id, {
      messageType: "system",
      body: "Closed by board",
    });
    expect(audit.sequence).toBe(3);
  });

  it("marks participants left without hard deleting authored history", async () => {
    const svc = meetingRoomService(db);
    const { room, participants } = await svc.create(companyId, {
      title: "Durable transcript",
      participants: [
        {
          participantType: "user",
          userId: "board-user",
          role: "host",
          status: "active",
        },
      ],
    });
    const participant = participants[0]!;
    const message = await svc.postMessage(companyId, room.id, {
      messageType: "user",
      authorUserId: "board-user",
      authorParticipantId: participant.id,
      body: "Keep this",
    });

    const removed = await svc.removeParticipant(companyId, room.id, participant.id);

    expect(removed?.status).toBe("left");
    expect(removed?.leftAt).toBeInstanceOf(Date);
    await expect(db.select().from(meetingParticipants)).resolves.toHaveLength(1);
    const [persistedMessage] = await db.select().from(meetingMessages).where(eq(meetingMessages.id, message.id));
    expect(persistedMessage.authorParticipantId).toBe(participant.id);
  });

  it("creates and updates summary records without applying downstream changes", async () => {
    const svc = meetingRoomService(db);
    const { room } = await svc.create(companyId, { title: "Summary room" });

    const summary = await svc.createSummary(companyId, room.id, {
      summaryKind: "recap",
      body: "Decision: ship.",
      linkedIssueId: null,
      linkedProjectDocumentId: null,
    });
    expect(summary).toEqual(expect.objectContaining({
      companyId,
      roomId: room.id,
      summaryKind: "recap",
      status: "draft",
    }));

    const updated = await svc.updateSummary(companyId, room.id, summary.id, {
      status: "accepted",
      proposalId: "12345678-1234-4234-9234-123456789abc",
    });

    expect(updated?.status).toBe("accepted");
    expect(updated?.proposalId).toBe("12345678-1234-4234-9234-123456789abc");
    await expect(db.select().from(meetingSummaries)).resolves.toHaveLength(1);
  });
});
