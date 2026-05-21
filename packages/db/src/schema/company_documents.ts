import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { companyDocumentFolders } from "./company_document_folders.js";
import { documents } from "./documents.js";
import { issues } from "./issues.js";
import { projects } from "./projects.js";

export const companyDocuments = pgTable(
  "company_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
    folderId: uuid("folder_id").references(() => companyDocumentFolders.id, { onDelete: "set null" }),
    title: text("title"),
    position: integer("position").notNull().default(0),
    sourceProjectId: uuid("source_project_id").references(() => projects.id, { onDelete: "set null" }),
    sourceIssueId: uuid("source_issue_id").references(() => issues.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyFolderIdx: index("company_documents_company_folder_idx").on(table.companyId, table.folderId),
    companyFolderPositionIdx: index("company_documents_company_folder_position_idx").on(
      table.companyId,
      table.folderId,
      table.position,
    ),
    sourceProjectIdx: index("company_documents_source_project_idx").on(table.companyId, table.sourceProjectId),
    sourceIssueIdx: index("company_documents_source_issue_idx").on(table.companyId, table.sourceIssueId),
    documentUq: uniqueIndex("company_documents_document_uq").on(table.documentId),
  }),
);
