import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import * as schema from "./schema/index.js";

const schemaExports = schema as Record<string, PgTable | undefined>;

function tableConfig(exportName: string) {
  const table = schemaExports[exportName];
  expect(table, `${exportName} should be exported from the DB schema index`).toBeDefined();
  return getTableConfig(table as PgTable);
}

function migrationCreating(tableName: string) {
  const migrationsDir = new URL("./migrations/", import.meta.url);
  return readdirSync(migrationsDir)
    .filter((file) => /^\d{4}_.+\.sql$/.test(file))
    .map((file) => readFileSync(join(migrationsDir.pathname, file), "utf8"))
    .find((contents) => contents.includes(`CREATE TABLE "${tableName}"`));
}

describe("meeting room schema exports", () => {
  it("exports the four meeting room tables from the schema index", () => {
    expect(schemaExports.meetingRooms).toBeDefined();
    expect(schemaExports.meetingParticipants).toBeDefined();
    expect(schemaExports.meetingMessages).toBeDefined();
    expect(schemaExports.meetingSummaries).toBeDefined();
  });
});

describe("meetingRooms schema", () => {
  it("defines a company-scoped room container with contextual links and lifecycle fields", () => {
    const config = tableConfig("meetingRooms");

    expect(config.name).toBe("meeting_rooms");
    expect(config.columns.map((column) => column.name)).toEqual([
      "id",
      "company_id",
      "project_id",
      "issue_id",
      "project_document_id",
      "title",
      "description",
      "status",
      "origin_kind",
      "origin_id",
      "created_by_user_id",
      "created_by_agent_id",
      "last_message_id",
      "last_message_at",
      "closed_at",
      "archived_at",
      "metadata",
      "created_at",
      "updated_at",
    ]);
    expect(config.indexes.map((index) => index.config.name).sort()).toEqual([
      "meeting_rooms_company_issue_status_idx",
      "meeting_rooms_company_origin_idx",
      "meeting_rooms_company_project_document_status_idx",
      "meeting_rooms_company_project_status_idx",
      "meeting_rooms_company_status_last_message_idx",
    ]);
  });
});

describe("meetingParticipants schema", () => {
  it("models user and agent room membership without a team target until teams are canonical", () => {
    const config = tableConfig("meetingParticipants");

    expect(config.name).toBe("meeting_participants");
    expect(config.columns.map((column) => column.name)).toEqual([
      "id",
      "company_id",
      "room_id",
      "participant_type",
      "user_id",
      "agent_id",
      "role",
      "status",
      "invited_by_user_id",
      "invited_by_agent_id",
      "last_seen_message_id",
      "last_invoked_run_id",
      "joined_at",
      "left_at",
      "created_at",
      "updated_at",
    ]);
    expect(config.columns.map((column) => column.name)).not.toContain("team_id");
    expect(config.indexes.map((index) => index.config.name).sort()).toEqual([
      "meeting_participants_company_agent_status_idx",
      "meeting_participants_company_room_idx",
      "meeting_participants_room_agent_active_uq",
      "meeting_participants_room_user_active_uq",
    ]);
  });
});

describe("meetingMessages schema", () => {
  it("models ordered auditable transcript messages", () => {
    const config = tableConfig("meetingMessages");

    expect(config.name).toBe("meeting_messages");
    expect(config.columns.map((column) => column.name)).toEqual([
      "id",
      "company_id",
      "room_id",
      "sequence",
      "message_type",
      "body",
      "format",
      "author_user_id",
      "author_agent_id",
      "author_participant_id",
      "source_run_id",
      "source_summary_id",
      "reply_to_message_id",
      "metadata",
      "edited_at",
      "deleted_at",
      "created_at",
    ]);
    expect(config.indexes.map((index) => index.config.name).sort()).toEqual([
      "meeting_messages_company_author_agent_created_idx",
      "meeting_messages_company_room_created_idx",
      "meeting_messages_room_sequence_uq",
    ]);
  });
});

describe("meetingSummaries schema", () => {
  it("models durable summaries with links to downstream work records", () => {
    const config = tableConfig("meetingSummaries");

    expect(config.name).toBe("meeting_summaries");
    expect(config.columns.map((column) => column.name)).toEqual([
      "id",
      "company_id",
      "room_id",
      "summary_kind",
      "status",
      "title",
      "body",
      "decisions",
      "action_items",
      "open_questions",
      "source_message_start_id",
      "source_message_end_id",
      "generated_by_user_id",
      "generated_by_agent_id",
      "source_run_id",
      "linked_issue_id",
      "linked_project_document_id",
      "linked_agent_reflection_id",
      "proposal_id",
      "created_at",
      "updated_at",
    ]);
    expect(config.indexes.map((index) => index.config.name).sort()).toEqual([
      "meeting_summaries_company_linked_issue_idx",
      "meeting_summaries_company_linked_project_document_idx",
      "meeting_summaries_company_room_status_created_idx",
    ]);
  });
});

describe("meeting room migration", () => {
  it("creates the meeting room tables and key indexes", () => {
    const migrationSql = migrationCreating("meeting_rooms");

    expect(migrationSql, "a migration should create meeting_rooms").toBeDefined();
    expect(migrationSql).toContain('CREATE TABLE "meeting_rooms"');
    expect(migrationSql).toContain('CREATE TABLE "meeting_participants"');
    expect(migrationSql).toContain('CREATE TABLE "meeting_messages"');
    expect(migrationSql).toContain('CREATE TABLE "meeting_summaries"');

    expect(migrationSql).toContain('"company_id" uuid NOT NULL');
    expect(migrationSql).toContain('"project_id" uuid');
    expect(migrationSql).toContain('"issue_id" uuid');
    expect(migrationSql).toContain('"project_document_id" uuid');
    expect(migrationSql).not.toContain('"team_id"');

    expect(migrationSql).toContain('CREATE INDEX "meeting_rooms_company_status_last_message_idx"');
    expect(migrationSql).toContain('CREATE INDEX "meeting_rooms_company_project_status_idx"');
    expect(migrationSql).toContain('CREATE INDEX "meeting_rooms_company_issue_status_idx"');
    expect(migrationSql).toContain('CREATE INDEX "meeting_rooms_company_project_document_status_idx"');
    expect(migrationSql).toContain('CREATE INDEX "meeting_participants_company_room_idx"');
    expect(migrationSql).toContain('CREATE INDEX "meeting_participants_company_agent_status_idx"');
    expect(migrationSql).toContain('CREATE UNIQUE INDEX "meeting_participants_room_user_active_uq"');
    expect(migrationSql).toContain('CREATE UNIQUE INDEX "meeting_participants_room_agent_active_uq"');
    expect(migrationSql).toContain('CREATE UNIQUE INDEX "meeting_messages_room_sequence_uq"');
    expect(migrationSql).toContain('CREATE INDEX "meeting_messages_company_author_agent_created_idx"');
    expect(migrationSql).toContain('CREATE INDEX "meeting_summaries_company_room_status_created_idx"');
    expect(migrationSql).toContain('CREATE INDEX "meeting_summaries_company_linked_issue_idx"');
    expect(migrationSql).toContain('CREATE INDEX "meeting_summaries_company_linked_project_document_idx"');
  });
});
