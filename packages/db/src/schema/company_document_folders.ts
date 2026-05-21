import { type AnyPgColumn, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const companyDocumentFolders = pgTable(
  "company_document_folders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id").references((): AnyPgColumn => companyDocumentFolders.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyParentIdx: index("company_document_folders_company_parent_idx").on(table.companyId, table.parentId),
    companyParentPositionIdx: index("company_document_folders_company_parent_position_idx").on(
      table.companyId,
      table.parentId,
      table.position,
    ),
    siblingNameUq: uniqueIndex("company_document_folders_sibling_name_uq").on(
      table.companyId,
      table.parentId,
      table.name,
    ),
  }),
);
