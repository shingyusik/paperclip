import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "./schema/index.js";

describe("projectDocuments schema", () => {
  it("defines a project-scoped document join table", () => {
    expect(schema.projectDocuments, "projectDocuments should be exported from the DB schema index").toBeDefined();
    if (!schema.projectDocuments) {
      return;
    }

    const config = getTableConfig(schema.projectDocuments);

    expect(config.name).toBe("project_documents");
    expect(config.columns.map((column) => column.name)).toEqual([
      "id",
      "company_id",
      "project_id",
      "document_id",
      "key",
      "created_at",
      "updated_at",
    ]);
    expect(config.indexes.map((index) => index.config.name).sort()).toEqual([
      "project_documents_company_project_key_uq",
      "project_documents_company_project_updated_idx",
      "project_documents_document_uq",
    ]);
  });
});

describe("project_documents migration", () => {
  it("creates the project document table and indexes", () => {
    const migrationsDir = new URL("./migrations/", import.meta.url);
    const migrationSql = readdirSync(migrationsDir)
      .filter((file) => /^\d{4}_.+\.sql$/.test(file))
      .map((file) => readFileSync(join(migrationsDir.pathname, file), "utf8"))
      .find((contents) => contents.includes('CREATE TABLE "project_documents"'));

    expect(migrationSql, "a migration should create project_documents").toBeDefined();
    expect(migrationSql).toContain('CREATE TABLE "project_documents"');
    expect(migrationSql).toContain('"company_id" uuid NOT NULL');
    expect(migrationSql).toContain('"project_id" uuid NOT NULL');
    expect(migrationSql).toContain('"document_id" uuid NOT NULL');
    expect(migrationSql).toContain('CREATE UNIQUE INDEX "project_documents_company_project_key_uq"');
    expect(migrationSql).toContain('CREATE UNIQUE INDEX "project_documents_document_uq"');
    expect(migrationSql).toContain('CREATE INDEX "project_documents_company_project_updated_idx"');
  });
});
