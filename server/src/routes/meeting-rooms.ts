import { Router } from "express";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import {
  addMeetingParticipantSchema,
  createMeetingRoomSchema,
  createMeetingSummarySchema,
  meetingRoomListQuerySchema,
  postMeetingMessageSchema,
  updateMeetingRoomSchema,
  updateMeetingSummarySchema,
} from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { logActivity, meetingRoomService } from "../services/index.js";
import { notFound } from "../errors.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";

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
