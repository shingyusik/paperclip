import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  agents,
  agentReflections,
  issues,
  meetingMessages,
  meetingParticipants,
  meetingRooms,
  meetingSummaries,
  projectDocuments,
  projects,
} from "@paperclipai/db";
import type {
  AddMeetingParticipant,
  CreateMeetingRoom,
  CreateMeetingSummary,
  MeetingRoomListQuery,
  PostMeetingMessage,
  UpdateMeetingRoom,
  UpdateMeetingSummary,
} from "@paperclipai/shared";
import { conflict, notFound, unprocessable } from "../errors.js";

type DbClient = Db;

const ROOM_STATUSES_BLOCKING_MESSAGES = new Set(["closed", "paused", "archived"]);

function isUniqueViolation(error: unknown): boolean {
  return !!error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "23505";
}

async function assertProjectInCompany(db: DbClient, companyId: string, projectId: string | null | undefined) {
  if (!projectId) return;
  const row = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.companyId, companyId)))
    .then((rows) => rows[0] ?? null);
  if (!row) {
    throw unprocessable("Meeting room project does not belong to this company");
  }
}

async function assertIssueInCompany(db: DbClient, companyId: string, issueId: string | null | undefined) {
  if (!issueId) return;
  const row = await db
    .select({ id: issues.id })
    .from(issues)
    .where(and(eq(issues.id, issueId), eq(issues.companyId, companyId)))
    .then((rows) => rows[0] ?? null);
  if (!row) {
    throw unprocessable("Meeting room issue does not belong to this company");
  }
}

async function assertProjectDocumentInCompany(
  db: DbClient,
  companyId: string,
  projectDocumentId: string | null | undefined,
) {
  if (!projectDocumentId) return;
  const row = await db
    .select({ id: projectDocuments.id })
    .from(projectDocuments)
    .where(and(eq(projectDocuments.id, projectDocumentId), eq(projectDocuments.companyId, companyId)))
    .then((rows) => rows[0] ?? null);
  if (!row) {
    throw unprocessable("Meeting room project document does not belong to this company");
  }
}

async function assertAgentInCompany(
  db: DbClient,
  companyId: string,
  agentId: string | null | undefined,
  message: string,
) {
  if (!agentId) return;
  const row = await db
    .select({ id: agents.id })
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.companyId, companyId)))
    .then((rows) => rows[0] ?? null);
  if (!row) {
    throw unprocessable(message);
  }
}

async function assertParticipantSupported(db: DbClient, companyId: string, participant: AddMeetingParticipant) {
  if (participant.participantType === "team") {
    throw unprocessable("Team meeting participants are not supported by the current database schema");
  }
  if (participant.participantType === "agent") {
    await assertAgentInCompany(db, companyId, participant.agentId, "Meeting participant agent does not belong to this company");
  }
  await assertAgentInCompany(db, companyId, participant.invitedByAgentId, "Meeting participant inviter agent does not belong to this company");
}

async function assertParticipantInRoom(
  db: DbClient,
  companyId: string,
  roomId: string,
  participantId: string | null | undefined,
) {
  if (!participantId) return;
  const row = await db
    .select({ id: meetingParticipants.id })
    .from(meetingParticipants)
    .where(
      and(
        eq(meetingParticipants.id, participantId),
        eq(meetingParticipants.roomId, roomId),
        eq(meetingParticipants.companyId, companyId),
      ),
    )
    .then((rows) => rows[0] ?? null);
  if (!row) {
    throw unprocessable("Meeting message participant does not belong to this room");
  }
}

async function assertMessageInRoom(
  db: DbClient,
  companyId: string,
  roomId: string,
  messageId: string | null | undefined,
  message: string,
) {
  if (!messageId) return;
  const row = await db
    .select({ id: meetingMessages.id })
    .from(meetingMessages)
    .where(
      and(
        eq(meetingMessages.id, messageId),
        eq(meetingMessages.roomId, roomId),
        eq(meetingMessages.companyId, companyId),
      ),
    )
    .then((rows) => rows[0] ?? null);
  if (!row) {
    throw unprocessable(message);
  }
}

async function assertSummaryInRoom(
  db: DbClient,
  companyId: string,
  roomId: string,
  summaryId: string | null | undefined,
) {
  if (!summaryId) return;
  const row = await db
    .select({ id: meetingSummaries.id })
    .from(meetingSummaries)
    .where(
      and(
        eq(meetingSummaries.id, summaryId),
        eq(meetingSummaries.roomId, roomId),
        eq(meetingSummaries.companyId, companyId),
      ),
    )
    .then((rows) => rows[0] ?? null);
  if (!row) {
    throw unprocessable("Meeting summary link does not belong to this room");
  }
}

async function assertAgentReflectionInCompany(
  db: DbClient,
  companyId: string,
  reflectionId: string | null | undefined,
) {
  if (!reflectionId) return;
  const row = await db
    .select({ id: agentReflections.id })
    .from(agentReflections)
    .where(and(eq(agentReflections.id, reflectionId), eq(agentReflections.companyId, companyId)))
    .then((rows) => rows[0] ?? null);
  if (!row) {
    throw unprocessable("Meeting summary linked reflection does not belong to this company");
  }
}

async function getRoom(db: DbClient, companyId: string, roomId: string) {
  return db
    .select()
    .from(meetingRooms)
    .where(and(eq(meetingRooms.id, roomId), eq(meetingRooms.companyId, companyId)))
    .then((rows) => rows[0] ?? null);
}

function normalizeParticipantValues(companyId: string, roomId: string, participant: AddMeetingParticipant) {
  const status = participant.status ?? "invited";
  return {
    companyId,
    roomId,
    participantType: participant.participantType,
    userId: participant.participantType === "user" ? participant.userId ?? null : null,
    agentId: participant.participantType === "agent" ? participant.agentId ?? null : null,
    role: participant.role ?? "member",
    status,
    invitedByUserId: participant.invitedByUserId ?? null,
    invitedByAgentId: participant.invitedByAgentId ?? null,
    joinedAt: status === "active" ? new Date() : null,
  };
}

function roomStatusPatch(status: UpdateMeetingRoom["status"] | undefined, existingClosedAt?: Date | null) {
  if (!status) return {};
  const now = new Date();
  if (status === "open" || status === "paused") {
    return { closedAt: null, archivedAt: null };
  }
  if (status === "closed") {
    return { closedAt: existingClosedAt ?? now, archivedAt: null };
  }
  if (status === "archived") {
    return { closedAt: existingClosedAt ?? now, archivedAt: now };
  }
  return {};
}

export function meetingRoomService(db: Db) {
  return {
    list: async (companyId: string, filters: MeetingRoomListQuery = {}) => {
      const limit = filters.limit ?? 20;
      const offset = filters.offset ?? 0;
      const conditions = [eq(meetingRooms.companyId, companyId)];

      if (filters.participantId) {
        const participant = await db
          .select({ roomId: meetingParticipants.roomId })
          .from(meetingParticipants)
          .where(
            and(
              eq(meetingParticipants.id, filters.participantId),
              eq(meetingParticipants.companyId, companyId),
            ),
          )
          .then((rows) => rows[0] ?? null);
        if (!participant) return [];
        conditions.push(eq(meetingRooms.id, participant.roomId));
      }
      if (filters.status) conditions.push(eq(meetingRooms.status, filters.status));
      if (filters.projectId) conditions.push(eq(meetingRooms.projectId, filters.projectId));
      if (filters.issueId) conditions.push(eq(meetingRooms.issueId, filters.issueId));
      if (filters.projectDocumentId) conditions.push(eq(meetingRooms.projectDocumentId, filters.projectDocumentId));

      return db
        .select()
        .from(meetingRooms)
        .where(and(...conditions))
        .orderBy(desc(meetingRooms.lastMessageAt), desc(meetingRooms.createdAt))
        .limit(limit)
        .offset(offset);
    },

    create: async (companyId: string, input: CreateMeetingRoom) => {
      try {
        return await db.transaction(async (tx) => {
          const txDb = tx as unknown as Db;
          await assertProjectInCompany(txDb, companyId, input.projectId);
          await assertIssueInCompany(txDb, companyId, input.issueId);
          await assertProjectDocumentInCompany(txDb, companyId, input.projectDocumentId);
          await assertAgentInCompany(txDb, companyId, input.createdByAgentId, "Meeting room creator agent does not belong to this company");
          for (const participant of input.participants ?? []) {
            await assertParticipantSupported(txDb, companyId, participant);
          }

          const [room] = await txDb.insert(meetingRooms).values({
            companyId,
            projectId: input.projectId ?? null,
            issueId: input.issueId ?? null,
            projectDocumentId: input.projectDocumentId ?? null,
            title: input.title,
            description: input.description ?? null,
            status: input.status ?? "open",
            originKind: input.originKind ?? "user_created",
            originId: input.originId ?? null,
            createdByUserId: input.createdByUserId ?? null,
            createdByAgentId: input.createdByAgentId ?? null,
            metadata: input.metadata ?? null,
            ...roomStatusPatch(input.status),
          }).returning();

          const participantValues = (input.participants ?? []).map((participant) =>
            normalizeParticipantValues(companyId, room.id, participant)
          );
          const participants = participantValues.length > 0
            ? await txDb.insert(meetingParticipants).values(participantValues).returning()
            : [];

          return { room, participants };
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw conflict("Meeting room participant already exists");
        }
        throw error;
      }
    },

    getDetails: async (companyId: string, roomId: string) => {
      const room = await getRoom(db, companyId, roomId);
      if (!room) return null;
      const [participants, latestSummaryRows] = await Promise.all([
        db
          .select()
          .from(meetingParticipants)
          .where(and(eq(meetingParticipants.roomId, roomId), eq(meetingParticipants.companyId, companyId)))
          .orderBy(asc(meetingParticipants.createdAt)),
        db
          .select({
            id: meetingSummaries.id,
            companyId: meetingSummaries.companyId,
            roomId: meetingSummaries.roomId,
            summaryKind: meetingSummaries.summaryKind,
            status: meetingSummaries.status,
            title: meetingSummaries.title,
            proposalId: meetingSummaries.proposalId,
            createdAt: meetingSummaries.createdAt,
            updatedAt: meetingSummaries.updatedAt,
          })
          .from(meetingSummaries)
          .where(and(eq(meetingSummaries.roomId, roomId), eq(meetingSummaries.companyId, companyId)))
          .orderBy(desc(meetingSummaries.createdAt))
          .limit(1),
      ]);

      return {
        room,
        participants,
        latestSummary: latestSummaryRows[0] ?? null,
      };
    },

    update: async (companyId: string, roomId: string, input: UpdateMeetingRoom) => {
      const existing = await getRoom(db, companyId, roomId);
      if (!existing) return null;
      const [updated] = await db
        .update(meetingRooms)
        .set({
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
          ...roomStatusPatch(input.status, existing.closedAt),
          updatedAt: new Date(),
        })
        .where(and(eq(meetingRooms.id, roomId), eq(meetingRooms.companyId, companyId)))
        .returning();
      return updated ?? null;
    },

    addParticipant: async (companyId: string, roomId: string, input: AddMeetingParticipant) => {
      const room = await getRoom(db, companyId, roomId);
      if (!room) throw notFound("Meeting room not found");
      await assertParticipantSupported(db, companyId, input);
      try {
        const [participant] = await db.insert(meetingParticipants).values(
          normalizeParticipantValues(companyId, roomId, input),
        ).returning();
        return participant;
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw conflict("Meeting room participant already exists");
        }
        throw error;
      }
    },

    resolveInvokableAgentParticipant: async (companyId: string, roomId: string, participantId: string) => {
      const room = await getRoom(db, companyId, roomId);
      if (!room) throw notFound("Meeting room not found");
      const participant = await db
        .select()
        .from(meetingParticipants)
        .where(
          and(
            eq(meetingParticipants.id, participantId),
            eq(meetingParticipants.roomId, roomId),
            eq(meetingParticipants.companyId, companyId),
          ),
        )
        .then((rows) => rows[0] ?? null);
      if (!participant) throw notFound("Meeting participant not found");
      if (participant.participantType !== "agent") {
        throw unprocessable("Meeting participant invocation requires an agent participant");
      }
      if (!participant.agentId) {
        throw unprocessable("Meeting participant invocation requires an agent id");
      }
      if (participant.status === "left" || participant.status === "disabled") {
        throw unprocessable("Cannot invoke a participant that has left or is disabled");
      }
      return { room, participant };
    },

    recordParticipantInvocation: async (
      companyId: string,
      roomId: string,
      participantId: string,
      runId: string,
    ) => {
      const now = new Date();
      await db
        .update(meetingParticipants)
        .set({
          lastInvokedRunId: runId,
          updatedAt: now,
        })
        .where(
          and(
            eq(meetingParticipants.id, participantId),
            eq(meetingParticipants.roomId, roomId),
            eq(meetingParticipants.companyId, companyId),
          ),
        )
        .returning();
    },

    removeParticipant: async (companyId: string, roomId: string, participantId: string) => {
      const now = new Date();
      const [participant] = await db
        .update(meetingParticipants)
        .set({
          status: "left",
          leftAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(meetingParticipants.id, participantId),
            eq(meetingParticipants.roomId, roomId),
            eq(meetingParticipants.companyId, companyId),
          ),
        )
        .returning();
      return participant ?? null;
    },

    listMessages: async (
      companyId: string,
      roomId: string,
      options: { limit?: number; offset?: number } = {},
    ) => {
      const room = await getRoom(db, companyId, roomId);
      if (!room) throw notFound("Meeting room not found");
      return db
        .select()
        .from(meetingMessages)
        .where(and(eq(meetingMessages.roomId, roomId), eq(meetingMessages.companyId, companyId)))
        .orderBy(asc(meetingMessages.sequence))
        .limit(options.limit ?? 50)
        .offset(options.offset ?? 0);
    },

    postMessage: async (companyId: string, roomId: string, input: PostMeetingMessage) => {
      try {
        return await db.transaction(async (tx) => {
          const txDb = tx as unknown as Db;
          const room = await getRoom(txDb, companyId, roomId);
          if (!room) throw notFound("Meeting room not found");
          if (ROOM_STATUSES_BLOCKING_MESSAGES.has(room.status) && input.messageType !== "system") {
            throw conflict("Cannot post non-system messages to closed, paused, or archived meeting rooms");
          }
          await assertAgentInCompany(txDb, companyId, input.authorAgentId, "Meeting message author agent does not belong to this company");
          await assertParticipantInRoom(txDb, companyId, roomId, input.authorParticipantId);
          await assertSummaryInRoom(txDb, companyId, roomId, input.sourceSummaryId);
          await assertMessageInRoom(txDb, companyId, roomId, input.replyToMessageId, "Reply target message does not belong to this room");

          const [sequenceRow] = await txDb
            .select({ nextSequence: sql<number>`coalesce(max(${meetingMessages.sequence}), 0) + 1` })
            .from(meetingMessages)
            .where(and(eq(meetingMessages.roomId, roomId), eq(meetingMessages.companyId, companyId)));
          const sequence = Number(sequenceRow?.nextSequence ?? 1);
          const [message] = await txDb.insert(meetingMessages).values({
            companyId,
            roomId,
            sequence,
            messageType: input.messageType,
            body: input.body,
            format: input.format ?? "markdown",
            authorUserId: input.authorUserId ?? null,
            authorAgentId: input.authorAgentId ?? null,
            authorParticipantId: input.authorParticipantId ?? null,
            sourceRunId: input.sourceRunId ?? null,
            sourceSummaryId: input.sourceSummaryId ?? null,
            replyToMessageId: input.replyToMessageId ?? null,
            metadata: input.metadata ?? null,
          }).returning();
          await txDb
            .update(meetingRooms)
            .set({
              lastMessageId: message.id,
              lastMessageAt: message.createdAt,
              updatedAt: new Date(),
            })
            .where(and(eq(meetingRooms.id, roomId), eq(meetingRooms.companyId, companyId)));
          return message;
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw conflict("Meeting message sequence already exists");
        }
        throw error;
      }
    },

    createSummary: async (companyId: string, roomId: string, input: CreateMeetingSummary) => {
      const room = await getRoom(db, companyId, roomId);
      if (!room) throw notFound("Meeting room not found");
      await assertIssueInCompany(db, companyId, input.linkedIssueId);
      await assertProjectDocumentInCompany(db, companyId, input.linkedProjectDocumentId);
      await assertAgentReflectionInCompany(db, companyId, input.linkedAgentReflectionId);
      await assertAgentInCompany(db, companyId, input.generatedByAgentId, "Meeting summary generator agent does not belong to this company");
      await assertMessageInRoom(db, companyId, roomId, input.sourceMessageStartId, "Summary source start message does not belong to this room");
      await assertMessageInRoom(db, companyId, roomId, input.sourceMessageEndId, "Summary source end message does not belong to this room");
      const [summary] = await db.insert(meetingSummaries).values({
        companyId,
        roomId,
        summaryKind: input.summaryKind,
        status: input.status ?? "draft",
        title: input.title ?? null,
        body: input.body,
        decisions: input.decisions ?? null,
        actionItems: input.actionItems ?? null,
        openQuestions: input.openQuestions ?? null,
        sourceMessageStartId: input.sourceMessageStartId ?? null,
        sourceMessageEndId: input.sourceMessageEndId ?? null,
        generatedByUserId: input.generatedByUserId ?? null,
        generatedByAgentId: input.generatedByAgentId ?? null,
        sourceRunId: input.sourceRunId ?? null,
        linkedIssueId: input.linkedIssueId ?? null,
        linkedProjectDocumentId: input.linkedProjectDocumentId ?? null,
        linkedAgentReflectionId: input.linkedAgentReflectionId ?? null,
        proposalId: input.proposalId ?? null,
      }).returning();
      return summary;
    },

    updateSummary: async (
      companyId: string,
      roomId: string,
      summaryId: string,
      input: UpdateMeetingSummary,
    ) => {
      await assertIssueInCompany(db, companyId, input.linkedIssueId);
      await assertProjectDocumentInCompany(db, companyId, input.linkedProjectDocumentId);
      await assertAgentReflectionInCompany(db, companyId, input.linkedAgentReflectionId);
      const [summary] = await db
        .update(meetingSummaries)
        .set({
          ...(input.summaryKind !== undefined ? { summaryKind: input.summaryKind } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.body !== undefined ? { body: input.body } : {}),
          ...(input.decisions !== undefined ? { decisions: input.decisions } : {}),
          ...(input.actionItems !== undefined ? { actionItems: input.actionItems } : {}),
          ...(input.openQuestions !== undefined ? { openQuestions: input.openQuestions } : {}),
          ...(input.linkedIssueId !== undefined ? { linkedIssueId: input.linkedIssueId } : {}),
          ...(input.linkedProjectDocumentId !== undefined
            ? { linkedProjectDocumentId: input.linkedProjectDocumentId }
            : {}),
          ...(input.linkedAgentReflectionId !== undefined
            ? { linkedAgentReflectionId: input.linkedAgentReflectionId }
            : {}),
          ...(input.proposalId !== undefined ? { proposalId: input.proposalId } : {}),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(meetingSummaries.id, summaryId),
            eq(meetingSummaries.roomId, roomId),
            eq(meetingSummaries.companyId, companyId),
          ),
        )
        .returning();
      return summary ?? null;
    },
  };
}
