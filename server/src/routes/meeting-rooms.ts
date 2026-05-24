import { Router } from "express";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import {
  addMeetingParticipantSchema,
  createMeetingRoomSchema,
  createMeetingSummarySchema,
  invokeMeetingParticipantSchema,
  meetingRoomListQuerySchema,
  postMeetingMessageSchema,
  updateMeetingRoomSchema,
  updateMeetingSummarySchema,
} from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { accessService, heartbeatService, logActivity, meetingRoomService } from "../services/index.js";
import { conflict, forbidden, notFound, unprocessable } from "../errors.js";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";

const messageListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

function sortedChangedKeys(input: Record<string, unknown>) {
  return Object.keys(input).sort();
}

export function meetingRoomRoutes(db: Db) {
  const router = Router();
  const svc = meetingRoomService(db);
  const heartbeat = heartbeatService(db);
  const access = accessService(db);

  async function assertBoardCanManageAgentsForCompany(req: Parameters<typeof assertBoard>[0], companyId: string) {
    assertBoard(req);
    assertCompanyAccess(req, companyId);
    if (req.actor.source === "local_implicit" || req.actor.isInstanceAdmin) return;
    const allowed = await access.canUser(companyId, req.actor.userId, "agents:create");
    if (!allowed) {
      throw forbidden("Missing permission: agents:create");
    }
  }

  function buildMeetingRoomWakePayload(
    roomId: string,
    participantId: string,
    input: {
      transcriptWindow?: Record<string, unknown>;
      lastMessageId?: string | null;
      instruction?: string | null;
    },
  ) {
    return {
      meetingRoomId: roomId,
      meetingParticipantId: participantId,
      ...(input.transcriptWindow !== undefined ? { transcriptWindow: input.transcriptWindow } : {}),
      ...(input.lastMessageId ? { lastMessageId: input.lastMessageId } : {}),
      ...(input.instruction ? { instruction: input.instruction } : {}),
    };
  }

  function buildMeetingRoomContextSnapshot(
    req: Parameters<typeof getActorInfo>[0],
    room: {
      id: string;
      projectId?: string | null;
      issueId?: string | null;
      projectDocumentId?: string | null;
    },
    participantId: string,
  ) {
    return {
      source: "meeting_room",
      meetingRoomId: room.id,
      meetingParticipantId: participantId,
      ...(room.projectId ? { projectId: room.projectId } : {}),
      ...(room.issueId ? { issueId: room.issueId } : {}),
      ...(room.projectDocumentId ? { projectDocumentId: room.projectDocumentId } : {}),
      triggeredBy: req.actor.type,
      actorId: req.actor.type === "agent" ? req.actor.agentId : req.actor.userId,
    };
  }

  router.get("/companies/:companyId/meeting-rooms", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const query = meetingRoomListQuerySchema.parse(req.query);
    const rooms = await svc.list(companyId, query);
    res.json(rooms);
  });

  router.post("/companies/:companyId/meeting-rooms", validate(createMeetingRoomSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const result = await svc.create(companyId, req.body);
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "meeting_room.created",
      entityType: "meeting_room",
      entityId: result.room.id,
      details: {
        title: result.room.title,
        status: result.room.status,
        originKind: result.room.originKind,
        participantCount: result.participants.length,
        projectId: result.room.projectId,
        issueId: result.room.issueId,
        projectDocumentId: result.room.projectDocumentId,
      },
    });
    res.status(201).json(result);
  });

  router.get("/companies/:companyId/meeting-rooms/:roomId", async (req, res) => {
    const companyId = req.params.companyId as string;
    const roomId = req.params.roomId as string;
    assertCompanyAccess(req, companyId);
    const result = await svc.getDetails(companyId, roomId);
    if (!result) {
      throw notFound("Meeting room not found");
    }
    res.json(result);
  });

  router.patch("/companies/:companyId/meeting-rooms/:roomId", validate(updateMeetingRoomSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    const roomId = req.params.roomId as string;
    assertCompanyAccess(req, companyId);
    const room = await svc.update(companyId, roomId, req.body);
    if (!room) {
      throw notFound("Meeting room not found");
    }
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "meeting_room.updated",
      entityType: "meeting_room",
      entityId: room.id,
      details: {
        changedKeys: sortedChangedKeys(req.body),
        status: room.status,
      },
    });
    res.json(room);
  });

  router.post(
    "/companies/:companyId/meeting-rooms/:roomId/participants",
    validate(addMeetingParticipantSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const roomId = req.params.roomId as string;
      assertCompanyAccess(req, companyId);
      const participant = await svc.addParticipant(companyId, roomId, req.body);
      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "meeting_room.participant_added",
        entityType: "meeting_room",
        entityId: roomId,
        details: {
          participantId: participant.id,
          participantType: participant.participantType,
          agentId: participant.agentId,
          userId: participant.userId,
          role: participant.role,
          status: participant.status,
        },
      });
      res.status(201).json(participant);
    },
  );

  router.delete("/companies/:companyId/meeting-rooms/:roomId/participants/:participantId", async (req, res) => {
    const companyId = req.params.companyId as string;
    const roomId = req.params.roomId as string;
    const participantId = req.params.participantId as string;
    assertCompanyAccess(req, companyId);
    const participant = await svc.removeParticipant(companyId, roomId, participantId);
    if (!participant) {
      throw notFound("Meeting participant not found");
    }
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "meeting_room.participant_removed",
      entityType: "meeting_room",
      entityId: roomId,
      details: {
        participantId: participant.id,
        participantType: participant.participantType,
        agentId: participant.agentId,
        userId: participant.userId,
        status: participant.status,
      },
    });
    res.json(participant);
  });

  router.post(
    "/companies/:companyId/meeting-rooms/:roomId/participants/:participantId/invoke",
    validate(invokeMeetingParticipantSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const roomId = req.params.roomId as string;
      const participantId = req.params.participantId as string;
      assertCompanyAccess(req, companyId);
      await assertBoardCanManageAgentsForCompany(req, companyId);

      const { room, participant } = await svc.resolveInvokableAgentParticipant(companyId, roomId, participantId);
      if (participant.participantType !== "agent") {
        throw unprocessable("Meeting participant invocation requires an agent participant");
      }
      if (!participant.agentId) {
        throw unprocessable("Meeting participant invocation requires an agent id");
      }
      if ((room.status === "closed" || room.status === "paused" || room.status === "archived") && req.body.triggerDetail !== "system") {
        throw conflict("Cannot invoke agents for closed, paused, or archived meeting rooms");
      }

      const run = await heartbeat.wakeup(participant.agentId, {
        source: "on_demand",
        triggerDetail: req.body.triggerDetail,
        reason: req.body.reason ?? "Explicit meeting-room agent invocation",
        payload: buildMeetingRoomWakePayload(roomId, participantId, req.body),
        idempotencyKey: req.body.idempotencyKey ?? null,
        requestedByActorType: "user",
        requestedByActorId: req.actor.userId ?? null,
        contextSnapshot: buildMeetingRoomContextSnapshot(req, room, participantId),
      });

      if (!run) {
        res.status(202).json({
          status: "skipped",
          reason: "wakeup_skipped",
          message: "Wakeup was skipped.",
          meetingRoomId: roomId,
          meetingParticipantId: participantId,
          agentId: participant.agentId,
        });
        return;
      }

      await svc.recordParticipantInvocation(companyId, roomId, participantId, run.id);
      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "meeting_room.agent_invoked",
        entityType: "meeting_room",
        entityId: roomId,
        details: {
          participantId,
          agentId: participant.agentId,
          runId: run.id,
          roomStatus: room.status,
        },
      });
      res.status(202).json(run);
    },
  );

  router.get("/companies/:companyId/meeting-rooms/:roomId/messages", async (req, res) => {
    const companyId = req.params.companyId as string;
    const roomId = req.params.roomId as string;
    assertCompanyAccess(req, companyId);
    const query = messageListQuerySchema.parse(req.query);
    const messages = await svc.listMessages(companyId, roomId, query);
    res.json(messages);
  });

  router.post(
    "/companies/:companyId/meeting-rooms/:roomId/messages",
    validate(postMeetingMessageSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const roomId = req.params.roomId as string;
      assertCompanyAccess(req, companyId);
      const message = await svc.postMessage(companyId, roomId, req.body);
      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "meeting_room.message_posted",
        entityType: "meeting_room",
        entityId: roomId,
        details: {
          messageId: message.id,
          messageType: message.messageType,
          sequence: message.sequence,
          authorAgentId: message.authorAgentId,
          authorUserId: message.authorUserId,
        },
      });
      res.status(201).json(message);
    },
  );

  router.post(
    "/companies/:companyId/meeting-rooms/:roomId/summaries",
    validate(createMeetingSummarySchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const roomId = req.params.roomId as string;
      assertCompanyAccess(req, companyId);
      const summary = await svc.createSummary(companyId, roomId, req.body);
      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "meeting_room.summary_created",
        entityType: "meeting_room",
        entityId: roomId,
        details: {
          summaryId: summary.id,
          summaryKind: summary.summaryKind,
          status: summary.status,
          proposalId: summary.proposalId,
        },
      });
      res.status(201).json(summary);
    },
  );

  router.patch(
    "/companies/:companyId/meeting-rooms/:roomId/summaries/:summaryId",
    validate(updateMeetingSummarySchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const roomId = req.params.roomId as string;
      const summaryId = req.params.summaryId as string;
      assertCompanyAccess(req, companyId);
      const summary = await svc.updateSummary(companyId, roomId, summaryId, req.body);
      if (!summary) {
        throw notFound("Meeting summary not found");
      }
      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        runId: actor.runId,
        action: "meeting_room.summary_updated",
        entityType: "meeting_room",
        entityId: roomId,
        details: {
          summaryId: summary.id,
          changedKeys: sortedChangedKeys(req.body),
          summaryKind: summary.summaryKind,
          status: summary.status,
          proposalId: summary.proposalId,
        },
      });
      res.json(summary);
    },
  );

  return router;
}
