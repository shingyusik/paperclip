import { sql } from "drizzle-orm";
import { type AnyPgColumn, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { agentReflections } from "./agent_reflections.js";
import { agents } from "./agents.js";
import { authUsers } from "./auth.js";
import { companies } from "./companies.js";
import { heartbeatRuns } from "./heartbeat_runs.js";
import { issues } from "./issues.js";
import { projectDocuments } from "./project_documents.js";
import { projects } from "./projects.js";

export const meetingRooms = pgTable(
  "meeting_rooms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    issueId: uuid("issue_id").references(() => issues.id, { onDelete: "set null" }),
    projectDocumentId: uuid("project_document_id").references(() => projectDocuments.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status").notNull().default("open"),
    originKind: text("origin_kind").notNull().default("user_created"),
    originId: text("origin_id"),
    createdByUserId: text("created_by_user_id").references(() => authUsers.id, { onDelete: "set null" }),
    createdByAgentId: uuid("created_by_agent_id").references(() => agents.id, { onDelete: "set null" }),
    lastMessageId: uuid("last_message_id").references((): AnyPgColumn => meetingMessages.id, {
      onDelete: "set null",
    }),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyStatusLastMessageIdx: index("meeting_rooms_company_status_last_message_idx").on(
      table.companyId,
      table.status,
      table.lastMessageAt,
    ),
    companyProjectStatusIdx: index("meeting_rooms_company_project_status_idx").on(
      table.companyId,
      table.projectId,
      table.status,
    ),
    companyIssueStatusIdx: index("meeting_rooms_company_issue_status_idx").on(
      table.companyId,
      table.issueId,
      table.status,
    ),
    companyProjectDocumentStatusIdx: index("meeting_rooms_company_project_document_status_idx").on(
      table.companyId,
      table.projectDocumentId,
      table.status,
    ),
    companyOriginIdx: index("meeting_rooms_company_origin_idx").on(table.companyId, table.originKind, table.originId),
  }),
);

export const meetingParticipants = pgTable(
  "meeting_participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    roomId: uuid("room_id").notNull().references(() => meetingRooms.id),
    participantType: text("participant_type").notNull(),
    userId: text("user_id").references(() => authUsers.id, { onDelete: "set null" }),
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
    role: text("role").notNull().default("member"),
    status: text("status").notNull().default("invited"),
    invitedByUserId: text("invited_by_user_id").references(() => authUsers.id, { onDelete: "set null" }),
    invitedByAgentId: uuid("invited_by_agent_id").references(() => agents.id, { onDelete: "set null" }),
    lastSeenMessageId: uuid("last_seen_message_id").references((): AnyPgColumn => meetingMessages.id, {
      onDelete: "set null",
    }),
    lastInvokedRunId: uuid("last_invoked_run_id").references(() => heartbeatRuns.id, { onDelete: "set null" }),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
    leftAt: timestamp("left_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyRoomIdx: index("meeting_participants_company_room_idx").on(table.companyId, table.roomId),
    companyAgentStatusIdx: index("meeting_participants_company_agent_status_idx").on(
      table.companyId,
      table.agentId,
      table.status,
    ),
    roomUserActiveUq: uniqueIndex("meeting_participants_room_user_active_uq")
      .on(table.roomId, table.participantType, table.userId)
      .where(
        sql`${table.participantType} = 'user'
          and ${table.status} in ('invited', 'active')
          and ${table.userId} is not null`,
      ),
    roomAgentActiveUq: uniqueIndex("meeting_participants_room_agent_active_uq")
      .on(table.roomId, table.participantType, table.agentId)
      .where(
        sql`${table.participantType} = 'agent'
          and ${table.status} in ('invited', 'active')
          and ${table.agentId} is not null`,
      ),
  }),
);

export const meetingMessages = pgTable(
  "meeting_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    roomId: uuid("room_id").notNull().references(() => meetingRooms.id),
    sequence: integer("sequence").notNull(),
    messageType: text("message_type").notNull(),
    body: text("body").notNull(),
    format: text("format").notNull().default("markdown"),
    authorUserId: text("author_user_id").references(() => authUsers.id, { onDelete: "set null" }),
    authorAgentId: uuid("author_agent_id").references(() => agents.id, { onDelete: "set null" }),
    authorParticipantId: uuid("author_participant_id").references(() => meetingParticipants.id, { onDelete: "set null" }),
    sourceRunId: uuid("source_run_id").references(() => heartbeatRuns.id, { onDelete: "set null" }),
    sourceSummaryId: uuid("source_summary_id").references((): AnyPgColumn => meetingSummaries.id, {
      onDelete: "set null",
    }),
    replyToMessageId: uuid("reply_to_message_id").references((): AnyPgColumn => meetingMessages.id, {
      onDelete: "set null",
    }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    roomSequenceUq: uniqueIndex("meeting_messages_room_sequence_uq").on(table.roomId, table.sequence),
    companyRoomCreatedIdx: index("meeting_messages_company_room_created_idx").on(
      table.companyId,
      table.roomId,
      table.createdAt,
    ),
    companyAuthorAgentCreatedIdx: index("meeting_messages_company_author_agent_created_idx").on(
      table.companyId,
      table.authorAgentId,
      table.createdAt,
    ),
  }),
);

export const meetingSummaries = pgTable(
  "meeting_summaries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    roomId: uuid("room_id").notNull().references(() => meetingRooms.id),
    summaryKind: text("summary_kind").notNull(),
    status: text("status").notNull().default("draft"),
    title: text("title"),
    body: text("body").notNull(),
    decisions: jsonb("decisions").$type<Record<string, unknown>[]>(),
    actionItems: jsonb("action_items").$type<Record<string, unknown>[]>(),
    openQuestions: jsonb("open_questions").$type<Record<string, unknown>[]>(),
    sourceMessageStartId: uuid("source_message_start_id").references(() => meetingMessages.id, {
      onDelete: "set null",
    }),
    sourceMessageEndId: uuid("source_message_end_id").references(() => meetingMessages.id, { onDelete: "set null" }),
    generatedByUserId: text("generated_by_user_id").references(() => authUsers.id, { onDelete: "set null" }),
    generatedByAgentId: uuid("generated_by_agent_id").references(() => agents.id, { onDelete: "set null" }),
    sourceRunId: uuid("source_run_id").references(() => heartbeatRuns.id, { onDelete: "set null" }),
    linkedIssueId: uuid("linked_issue_id").references(() => issues.id, { onDelete: "set null" }),
    linkedProjectDocumentId: uuid("linked_project_document_id").references(() => projectDocuments.id, {
      onDelete: "set null",
    }),
    linkedAgentReflectionId: uuid("linked_agent_reflection_id").references(() => agentReflections.id, {
      onDelete: "set null",
    }),
    // Future governed proposal reference. No canonical proposals table exists yet.
    proposalId: uuid("proposal_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyRoomStatusCreatedIdx: index("meeting_summaries_company_room_status_created_idx").on(
      table.companyId,
      table.roomId,
      table.status,
      table.createdAt,
    ),
    companyLinkedIssueIdx: index("meeting_summaries_company_linked_issue_idx").on(
      table.companyId,
      table.linkedIssueId,
    ),
    companyLinkedProjectDocumentIdx: index("meeting_summaries_company_linked_project_document_idx").on(
      table.companyId,
      table.linkedProjectDocumentId,
    ),
  }),
);
