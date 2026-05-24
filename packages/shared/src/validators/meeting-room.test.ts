import { describe, expect, it } from "vitest";
import * as shared from "../index.js";
import * as validators from "./index.js";

const uuid = "123e4567-e89b-12d3-a456-426614174000";
const otherUuid = "123e4567-e89b-12d3-a456-426614174001";
const thirdUuid = "123e4567-e89b-12d3-a456-426614174002";

const sharedExports = shared as Record<string, any>;
const validatorExports = validators as Record<string, any>;

describe("meeting room shared exports", () => {
  it("exports constants and validators from the shared root and validators index", () => {
    expect(sharedExports.MEETING_ROOM_STATUSES).toEqual(["open", "paused", "closed", "archived"]);
    expect(sharedExports.MEETING_ROOM_ORIGIN_KINDS).toEqual([
      "user_created",
      "issue_triggered",
      "project_triggered",
      "document_triggered",
      "system_triggered",
    ]);
    expect(sharedExports.MEETING_PARTICIPANT_TYPES).toEqual(["user", "agent", "team"]);
    expect(sharedExports.MEETING_PARTICIPANT_ROLES).toEqual(["host", "member", "observer"]);
    expect(sharedExports.MEETING_PARTICIPANT_STATUSES).toEqual(["invited", "active", "left", "disabled"]);
    expect(sharedExports.MEETING_MESSAGE_TYPES).toEqual(["user", "agent", "system", "summary", "proposal"]);
    expect(sharedExports.MEETING_SUMMARY_STATUSES).toEqual([
      "draft",
      "accepted",
      "superseded",
      "proposed",
      "applied",
      "rejected",
    ]);
    expect(sharedExports.MEETING_SUMMARY_KINDS).toEqual([
      "recap",
      "decision_log",
      "action_items",
      "document_proposal",
      "reflection_input",
    ]);

    for (const exportName of [
      "meetingRoomStatusSchema",
      "meetingRoomOriginKindSchema",
      "meetingParticipantTypeSchema",
      "meetingParticipantRoleSchema",
      "meetingParticipantStatusSchema",
      "meetingMessageTypeSchema",
      "meetingSummaryStatusSchema",
      "meetingSummaryKindSchema",
      "createMeetingRoomSchema",
      "meetingRoomListQuerySchema",
      "updateMeetingRoomSchema",
      "addMeetingParticipantSchema",
      "postMeetingMessageSchema",
      "invokeMeetingParticipantSchema",
      "createMeetingSummarySchema",
      "updateMeetingSummarySchema",
    ]) {
      expect(validatorExports[exportName], `${exportName} should be exported from validators`).toBeDefined();
      expect(sharedExports[exportName], `${exportName} should be exported from the shared root`).toBeDefined();
    }
  });
});

describe("meeting room enum schemas", () => {
  it("accepts canonical enum values and rejects unknown values", () => {
    for (const status of sharedExports.MEETING_ROOM_STATUSES) {
      expect(validatorExports.meetingRoomStatusSchema.parse(status)).toBe(status);
    }
    expect(validatorExports.meetingRoomStatusSchema.safeParse("deleted").success).toBe(false);

    for (const originKind of sharedExports.MEETING_ROOM_ORIGIN_KINDS) {
      expect(validatorExports.meetingRoomOriginKindSchema.parse(originKind)).toBe(originKind);
    }
    expect(validatorExports.meetingRoomOriginKindSchema.safeParse("issue").success).toBe(false);

    for (const participantType of sharedExports.MEETING_PARTICIPANT_TYPES) {
      expect(validatorExports.meetingParticipantTypeSchema.parse(participantType)).toBe(participantType);
    }
    expect(validatorExports.meetingParticipantTypeSchema.safeParse("bot").success).toBe(false);

    for (const role of sharedExports.MEETING_PARTICIPANT_ROLES) {
      expect(validatorExports.meetingParticipantRoleSchema.parse(role)).toBe(role);
    }
    expect(validatorExports.meetingParticipantRoleSchema.safeParse("owner").success).toBe(false);

    for (const status of sharedExports.MEETING_PARTICIPANT_STATUSES) {
      expect(validatorExports.meetingParticipantStatusSchema.parse(status)).toBe(status);
    }
    expect(validatorExports.meetingParticipantStatusSchema.safeParse("removed").success).toBe(false);

    for (const messageType of sharedExports.MEETING_MESSAGE_TYPES) {
      expect(validatorExports.meetingMessageTypeSchema.parse(messageType)).toBe(messageType);
    }
    expect(validatorExports.meetingMessageTypeSchema.safeParse("event").success).toBe(false);

    for (const status of sharedExports.MEETING_SUMMARY_STATUSES) {
      expect(validatorExports.meetingSummaryStatusSchema.parse(status)).toBe(status);
    }
    expect(validatorExports.meetingSummaryStatusSchema.safeParse("published").success).toBe(false);

    for (const summaryKind of sharedExports.MEETING_SUMMARY_KINDS) {
      expect(validatorExports.meetingSummaryKindSchema.parse(summaryKind)).toBe(summaryKind);
    }
    expect(validatorExports.meetingSummaryKindSchema.safeParse("final").success).toBe(false);
  });
});

describe("meeting room payload schemas", () => {
  it("validates create, list, and update room payloads", () => {
    const created = validatorExports.createMeetingRoomSchema.parse({
      projectId: uuid,
      issueId: otherUuid,
      projectDocumentId: thirdUuid,
      title: "Launch readiness",
      description: "Coordinate release blockers and owners.",
      originKind: "project_triggered",
      originId: uuid,
      participants: [
        {
          participantType: "agent",
          agentId: otherUuid,
          role: "member",
        },
      ],
      metadata: { source: "test" },
    });

    expect(created.status).toBe("open");
    expect(created.participants[0].status).toBe("invited");

    const listed = validatorExports.meetingRoomListQuerySchema.parse({
      status: "open",
      projectId: uuid,
      issueId: otherUuid,
      projectDocumentId: thirdUuid,
      participantId: uuid,
      limit: "50",
      offset: "10",
    });

    expect(listed.limit).toBe(50);
    expect(listed.offset).toBe(10);
    expect(validatorExports.meetingRoomListQuerySchema.parse({})).toMatchObject({ limit: 20, offset: 0 });
    expect(validatorExports.meetingRoomListQuerySchema.safeParse({ limit: 101 }).success).toBe(false);

    expect(
      validatorExports.updateMeetingRoomSchema.parse({
        title: "Launch decisions",
        description: null,
        status: "closed",
        metadata: null,
      }),
    ).toMatchObject({ title: "Launch decisions", status: "closed" });
    expect(validatorExports.updateMeetingRoomSchema.safeParse({ title: "" }).success).toBe(false);
  });

  it("enforces participant target invariants", () => {
    expect(
      validatorExports.addMeetingParticipantSchema.parse({
        participantType: "user",
        userId: "user_123",
        role: "host",
      }),
    ).toMatchObject({ participantType: "user", userId: "user_123", status: "invited" });

    expect(
      validatorExports.addMeetingParticipantSchema.parse({
        participantType: "team",
        teamId: uuid,
        role: "observer",
      }),
    ).toMatchObject({ participantType: "team", teamId: uuid });

    expect(
      validatorExports.addMeetingParticipantSchema.safeParse({
        participantType: "agent",
        userId: "user_123",
        agentId: uuid,
      }).success,
    ).toBe(false);
    expect(validatorExports.addMeetingParticipantSchema.safeParse({ participantType: "team" }).success).toBe(false);
  });

  it("validates message payloads and enforces author invariants", () => {
    expect(
      validatorExports.postMeetingMessageSchema.parse({
        messageType: "user",
        body: "Please summarize current launch blockers.",
        authorUserId: "user_123",
        authorParticipantId: uuid,
        metadata: { clientMessageId: "msg-1" },
      }),
    ).toMatchObject({ messageType: "user", format: "markdown" });

    expect(
      validatorExports.postMeetingMessageSchema.parse({
        messageType: "system",
        body: "Room created.",
      }),
    ).toMatchObject({ messageType: "system" });

    expect(
      validatorExports.postMeetingMessageSchema.safeParse({
        messageType: "agent",
        body: "I can help.",
      }).success,
    ).toBe(false);
    expect(
      validatorExports.postMeetingMessageSchema.safeParse({
        messageType: "user",
        body: "Wrong author field.",
        authorAgentId: uuid,
      }).success,
    ).toBe(false);
    expect(
      validatorExports.postMeetingMessageSchema.safeParse({
        messageType: "system",
        body: "",
      }).success,
    ).toBe(false);
  });

  it("validates explicit meeting participant invocation payloads", () => {
    expect(
      validatorExports.invokeMeetingParticipantSchema.parse({
        reason: "  Please respond to the latest blocker.  ",
        idempotencyKey: "room-invoke-1",
        transcriptWindow: { limit: 12, beforeMessageId: uuid },
        lastMessageId: otherUuid,
        instruction: "Focus on release risk.",
      }),
    ).toEqual({
      triggerDetail: "manual",
      reason: "Please respond to the latest blocker.",
      idempotencyKey: "room-invoke-1",
      transcriptWindow: { limit: 12, beforeMessageId: uuid },
      lastMessageId: otherUuid,
      instruction: "Focus on release risk.",
    });

    expect(validatorExports.invokeMeetingParticipantSchema.parse({})).toEqual({
      triggerDetail: "manual",
    });
    expect(validatorExports.invokeMeetingParticipantSchema.safeParse({ reason: "" }).success).toBe(false);
    expect(validatorExports.invokeMeetingParticipantSchema.safeParse({ triggerDetail: "timer" }).success).toBe(false);
    expect(validatorExports.invokeMeetingParticipantSchema.safeParse({ transcriptWindow: { limit: 0 } }).success)
      .toBe(false);
    expect(validatorExports.invokeMeetingParticipantSchema.safeParse({ lastMessageId: "not-a-uuid" }).success).toBe(
      false,
    );
  });

  it("validates create and update summary payloads", () => {
    expect(
      validatorExports.createMeetingSummarySchema.parse({
        summaryKind: "recap",
        title: "Launch recap",
        body: "The room agreed to cut scope and keep the release date.",
        decisions: [{ decision: "Cut scope" }],
        actionItems: [{ owner: "CTO", task: "Confirm blockers" }],
        openQuestions: [{ question: "Can design finish today?" }],
        sourceMessageStartId: uuid,
        sourceMessageEndId: otherUuid,
        generatedByUserId: "user_123",
        linkedIssueId: thirdUuid,
        linkedProjectDocumentId: uuid,
      }),
    ).toMatchObject({ summaryKind: "recap", status: "draft" });

    expect(
      validatorExports.updateMeetingSummarySchema.parse({
        status: "accepted",
        title: "Accepted recap",
        body: "Accepted durable summary.",
        proposalId: null,
      }),
    ).toMatchObject({ status: "accepted" });

    expect(validatorExports.createMeetingSummarySchema.safeParse({ summaryKind: "recap", body: "" }).success).toBe(
      false,
    );
    expect(validatorExports.updateMeetingSummarySchema.safeParse({ status: "published" }).success).toBe(false);
  });
});
