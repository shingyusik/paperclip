import { z } from "zod";
import {
  MEETING_MESSAGE_TYPES,
  MEETING_PARTICIPANT_ROLES,
  MEETING_PARTICIPANT_STATUSES,
  MEETING_PARTICIPANT_TYPES,
  MEETING_ROOM_ORIGIN_KINDS,
  MEETING_ROOM_STATUSES,
  MEETING_SUMMARY_KINDS,
  MEETING_SUMMARY_STATUSES,
} from "../constants.js";

const uuidSchema = z.string().uuid();
const optionalUuidSchema = uuidSchema.optional().nullable();
const optionalUserIdSchema = z.string().trim().min(1).optional().nullable();
const metadataSchema = z.record(z.string(), z.unknown()).optional().nullable();
const structuredListSchema = z.array(z.record(z.string(), z.unknown())).optional().nullable();

export const meetingRoomStatusSchema = z.enum(MEETING_ROOM_STATUSES);
export const meetingRoomOriginKindSchema = z.enum(MEETING_ROOM_ORIGIN_KINDS);
export const meetingParticipantTypeSchema = z.enum(MEETING_PARTICIPANT_TYPES);
export const meetingParticipantRoleSchema = z.enum(MEETING_PARTICIPANT_ROLES);
export const meetingParticipantStatusSchema = z.enum(MEETING_PARTICIPANT_STATUSES);
export const meetingMessageTypeSchema = z.enum(MEETING_MESSAGE_TYPES);
export const meetingSummaryStatusSchema = z.enum(MEETING_SUMMARY_STATUSES);
export const meetingSummaryKindSchema = z.enum(MEETING_SUMMARY_KINDS);

function hasValue(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function validateParticipantTarget(value: {
  participantType: string;
  userId?: string | null;
  agentId?: string | null;
  teamId?: string | null;
}, ctx: z.RefinementCtx) {
  const targetFields = [
    ["userId", hasValue(value.userId)],
    ["agentId", hasValue(value.agentId)],
    ["teamId", hasValue(value.teamId)],
  ] as const;
  const presentTargets = targetFields.filter(([, present]) => present);

  if (presentTargets.length !== 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Participant requires exactly one target id.",
      path: ["participantType"],
    });
    return;
  }

  const expectedTarget =
    value.participantType === "user" ? "userId" : value.participantType === "agent" ? "agentId" : "teamId";
  if (presentTargets[0][0] !== expectedTarget) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Participant type ${value.participantType} requires ${expectedTarget}.`,
      path: [expectedTarget],
    });
  }
}

export const addMeetingParticipantSchema = z
  .object({
    participantType: meetingParticipantTypeSchema,
    userId: optionalUserIdSchema,
    agentId: optionalUuidSchema,
    teamId: optionalUuidSchema,
    role: meetingParticipantRoleSchema.optional().default("member"),
    status: meetingParticipantStatusSchema.optional().default("invited"),
    invitedByUserId: optionalUserIdSchema,
    invitedByAgentId: optionalUuidSchema,
  })
  .superRefine(validateParticipantTarget);

export const createMeetingRoomSchema = z.object({
  projectId: optionalUuidSchema,
  issueId: optionalUuidSchema,
  projectDocumentId: optionalUuidSchema,
  title: z.string().trim().min(1),
  description: z.string().optional().nullable(),
  status: meetingRoomStatusSchema.optional().default("open"),
  originKind: meetingRoomOriginKindSchema.optional().default("user_created"),
  originId: z.string().trim().min(1).optional().nullable(),
  createdByUserId: optionalUserIdSchema,
  createdByAgentId: optionalUuidSchema,
  participants: z.array(addMeetingParticipantSchema).optional().default([]),
  metadata: metadataSchema,
});

export const meetingRoomListQuerySchema = z.object({
  status: meetingRoomStatusSchema.optional(),
  projectId: uuidSchema.optional(),
  issueId: uuidSchema.optional(),
  projectDocumentId: uuidSchema.optional(),
  participantId: uuidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export const updateMeetingRoomSchema = z.object({
  title: z.string().trim().min(1).optional(),
  description: z.string().optional().nullable(),
  status: meetingRoomStatusSchema.optional(),
  metadata: metadataSchema,
});

function validateMessageAuthor(value: {
  messageType: string;
  authorUserId?: string | null;
  authorAgentId?: string | null;
}, ctx: z.RefinementCtx) {
  if (value.messageType === "user") {
    if (!hasValue(value.authorUserId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "User messages require authorUserId.",
        path: ["authorUserId"],
      });
    }
    if (hasValue(value.authorAgentId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "User messages cannot use authorAgentId.",
        path: ["authorAgentId"],
      });
    }
  }

  if (value.messageType === "agent") {
    if (!hasValue(value.authorAgentId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Agent messages require authorAgentId.",
        path: ["authorAgentId"],
      });
    }
    if (hasValue(value.authorUserId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Agent messages cannot use authorUserId.",
        path: ["authorUserId"],
      });
    }
  }
}

export const postMeetingMessageSchema = z
  .object({
    messageType: meetingMessageTypeSchema,
    body: z.string().trim().min(1),
    format: z.string().trim().min(1).optional().default("markdown"),
    authorUserId: optionalUserIdSchema,
    authorAgentId: optionalUuidSchema,
    authorParticipantId: optionalUuidSchema,
    sourceRunId: optionalUuidSchema,
    sourceSummaryId: optionalUuidSchema,
    replyToMessageId: optionalUuidSchema,
    metadata: metadataSchema,
  })
  .superRefine(validateMessageAuthor);

export const createMeetingSummarySchema = z.object({
  summaryKind: meetingSummaryKindSchema,
  status: meetingSummaryStatusSchema.optional().default("draft"),
  title: z.string().trim().min(1).optional().nullable(),
  body: z.string().trim().min(1),
  decisions: structuredListSchema,
  actionItems: structuredListSchema,
  openQuestions: structuredListSchema,
  sourceMessageStartId: optionalUuidSchema,
  sourceMessageEndId: optionalUuidSchema,
  generatedByUserId: optionalUserIdSchema,
  generatedByAgentId: optionalUuidSchema,
  sourceRunId: optionalUuidSchema,
  linkedIssueId: optionalUuidSchema,
  linkedProjectDocumentId: optionalUuidSchema,
  linkedAgentReflectionId: optionalUuidSchema,
  proposalId: optionalUuidSchema,
});

export const updateMeetingSummarySchema = z.object({
  summaryKind: meetingSummaryKindSchema.optional(),
  status: meetingSummaryStatusSchema.optional(),
  title: z.string().trim().min(1).optional().nullable(),
  body: z.string().trim().min(1).optional(),
  decisions: structuredListSchema,
  actionItems: structuredListSchema,
  openQuestions: structuredListSchema,
  linkedIssueId: optionalUuidSchema,
  linkedProjectDocumentId: optionalUuidSchema,
  linkedAgentReflectionId: optionalUuidSchema,
  proposalId: optionalUuidSchema,
});
