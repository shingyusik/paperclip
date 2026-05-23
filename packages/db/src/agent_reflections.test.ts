import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { agentReflections } from "./schema/index.js";

describe("agentReflections schema", () => {
  it("defines a queryable company-scoped and agent-scoped reflection table", () => {
    expect(agentReflections, "agentReflections should be exported from the DB schema index").toBeDefined();

    const config = getTableConfig(agentReflections);

    expect(config.name).toBe("agent_reflections");
    expect(config.columns.map((column) => column.name)).toEqual([
      "id",
      "company_id",
      "agent_id",
      "issue_id",
      "run_id",
      "summary",
      "learned",
      "proposed_memory_updates",
      "proposed_skill_updates",
      "shared_change_proposals",
      "status",
      "created_at",
      "updated_at",
    ]);
    expect(config.indexes.map((index) => index.config.name).sort()).toEqual([
      "agent_reflections_company_agent_status_idx",
      "agent_reflections_company_agent_updated_idx",
      "agent_reflections_company_issue_idx",
      "agent_reflections_company_run_idx",
    ]);
  });
});

describe("agent_reflections migration", () => {
  it("creates the reflection table with company, agent, issue, and run links", () => {
    const migrationsDir = new URL("./migrations/", import.meta.url);
    const migrationSql = readdirSync(migrationsDir)
      .filter((file) => /^\d{4}_.+\.sql$/.test(file))
      .map((file) => readFileSync(join(migrationsDir.pathname, file), "utf8"))
      .find((contents) => contents.includes('CREATE TABLE "agent_reflections"'));

    expect(migrationSql, "a migration should create agent_reflections").toBeDefined();
    expect(migrationSql).toContain('CREATE TABLE "agent_reflections"');
    expect(migrationSql).toContain('"company_id" uuid NOT NULL');
    expect(migrationSql).toContain('"agent_id" uuid NOT NULL');
    expect(migrationSql).toContain('"issue_id" uuid');
    expect(migrationSql).toContain('"run_id" uuid');
    expect(migrationSql).toContain('"proposed_memory_updates" jsonb DEFAULT');
    expect(migrationSql).toContain('"proposed_skill_updates" jsonb DEFAULT');
    expect(migrationSql).toContain('"shared_change_proposals" jsonb DEFAULT');
  });
});
