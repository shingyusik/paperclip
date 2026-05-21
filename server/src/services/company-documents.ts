import { and, asc, desc, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  companyDocumentFolders,
  companyDocuments,
  documentRevisions,
  documents,
  issues,
  projects,
} from "@paperclipai/db";
import { conflict, notFound, unprocessable } from "../errors.js";

const companyDocumentSelect = {
  id: companyDocuments.id,
  companyId: companyDocuments.companyId,
  documentId: companyDocuments.documentId,
  folderId: companyDocuments.folderId,
  title: companyDocuments.title,
  format: documents.format,
  body: documents.latestBody,
  latestRevisionId: documents.latestRevisionId,
  latestRevisionNumber: documents.latestRevisionNumber,
  sourceProjectId: companyDocuments.sourceProjectId,
  sourceIssueId: companyDocuments.sourceIssueId,
  position: companyDocuments.position,
  createdAt: companyDocuments.createdAt,
  updatedAt: companyDocuments.updatedAt,
};

function mapCompanyDocumentRow<T extends { body?: string; latestRevisionId: string | null }>(row: T) {
  return {
    ...row,
    latestRevisionId: row.latestRevisionId ?? null,
  };
}

export function companyDocumentService(db: Db) {
  async function assertFolder(companyId: string, folderId: string | null | undefined) {
    if (!folderId) return;
    const folder = await db
      .select({ id: companyDocumentFolders.id })
      .from(companyDocumentFolders)
      .where(and(eq(companyDocumentFolders.companyId, companyId), eq(companyDocumentFolders.id, folderId)))
      .then((rows) => rows[0] ?? null);
    if (!folder) throw unprocessable("Folder does not exist in this company");
  }

  async function assertSourceRefs(companyId: string, sourceProjectId?: string | null, sourceIssueId?: string | null) {
    if (sourceProjectId) {
      const project = await db
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.companyId, companyId), eq(projects.id, sourceProjectId)))
        .then((rows) => rows[0] ?? null);
      if (!project) throw unprocessable("Source project does not exist in this company");
    }
    if (sourceIssueId) {
      const issue = await db
        .select({ id: issues.id, projectId: issues.projectId })
        .from(issues)
        .where(and(eq(issues.companyId, companyId), eq(issues.id, sourceIssueId)))
        .then((rows) => rows[0] ?? null);
      if (!issue) throw unprocessable("Source issue does not exist in this company");
      if (sourceProjectId && issue.projectId && issue.projectId !== sourceProjectId) {
        throw unprocessable("Source issue does not belong to the selected source project");
      }
    }
  }

  return {
    listLibrary: async (companyId: string) => {
      const [folders, documentRows] = await Promise.all([
        db
          .select()
          .from(companyDocumentFolders)
          .where(eq(companyDocumentFolders.companyId, companyId))
          .orderBy(asc(companyDocumentFolders.parentId), asc(companyDocumentFolders.position), asc(companyDocumentFolders.name)),
        db
          .select(companyDocumentSelect)
          .from(companyDocuments)
          .innerJoin(documents, eq(companyDocuments.documentId, documents.id))
          .where(eq(companyDocuments.companyId, companyId))
          .orderBy(asc(companyDocuments.folderId), asc(companyDocuments.position), desc(companyDocuments.updatedAt)),
      ]);

      return {
        folders,
        documents: documentRows.map(({ body: _body, ...row }) => mapCompanyDocumentRow(row)),
      };
    },

    createFolder: async (
      companyId: string,
      input: { parentId?: string | null; name: string; position?: number },
    ) => {
      await assertFolder(companyId, input.parentId);
      const now = new Date();
      const [folder] = await db
        .insert(companyDocumentFolders)
        .values({
          companyId,
          parentId: input.parentId ?? null,
          name: input.name,
          position: input.position ?? 0,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return folder;
    },

    updateFolder: async (
      companyId: string,
      folderId: string,
      input: { parentId?: string | null; name?: string; position?: number },
    ) => {
      if (input.parentId === folderId) throw unprocessable("Folder cannot be its own parent");
      await assertFolder(companyId, input.parentId);
      const [folder] = await db
        .update(companyDocumentFolders)
        .set({
          ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.position !== undefined ? { position: input.position } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(companyDocumentFolders.companyId, companyId), eq(companyDocumentFolders.id, folderId)))
        .returning();
      return folder ?? null;
    },

    deleteFolder: async (companyId: string, folderId: string) => {
      const [folder] = await db
        .delete(companyDocumentFolders)
        .where(and(eq(companyDocumentFolders.companyId, companyId), eq(companyDocumentFolders.id, folderId)))
        .returning();
      return folder ?? null;
    },

    getDocument: async (companyId: string, entryId: string) => {
      const row = await db
        .select(companyDocumentSelect)
        .from(companyDocuments)
        .innerJoin(documents, eq(companyDocuments.documentId, documents.id))
        .where(and(eq(companyDocuments.companyId, companyId), eq(companyDocuments.id, entryId)))
        .then((rows) => rows[0] ?? null);
      return row ? mapCompanyDocumentRow(row) : null;
    },

    createDocument: async (
      companyId: string,
      input: {
        folderId?: string | null;
        title?: string | null;
        format: string;
        body: string;
        sourceProjectId?: string | null;
        sourceIssueId?: string | null;
        position?: number;
        createdByAgentId?: string | null;
        createdByUserId?: string | null;
      },
    ) => {
      await assertFolder(companyId, input.folderId);
      await assertSourceRefs(companyId, input.sourceProjectId, input.sourceIssueId);

      return db.transaction(async (tx) => {
        const now = new Date();
        const [document] = await tx
          .insert(documents)
          .values({
            companyId,
            title: input.title ?? null,
            format: input.format,
            latestBody: input.body,
            latestRevisionId: null,
            latestRevisionNumber: 1,
            createdByAgentId: input.createdByAgentId ?? null,
            createdByUserId: input.createdByUserId ?? null,
            updatedByAgentId: input.createdByAgentId ?? null,
            updatedByUserId: input.createdByUserId ?? null,
            createdAt: now,
            updatedAt: now,
          })
          .returning();

        const [revision] = await tx
          .insert(documentRevisions)
          .values({
            companyId,
            documentId: document.id,
            revisionNumber: 1,
            title: input.title ?? null,
            format: input.format,
            body: input.body,
            createdByAgentId: input.createdByAgentId ?? null,
            createdByUserId: input.createdByUserId ?? null,
            createdAt: now,
          })
          .returning();

        await tx.update(documents).set({ latestRevisionId: revision.id }).where(eq(documents.id, document.id));

        const [entry] = await tx
          .insert(companyDocuments)
          .values({
            companyId,
            documentId: document.id,
            folderId: input.folderId ?? null,
            title: input.title ?? null,
            position: input.position ?? 0,
            sourceProjectId: input.sourceProjectId ?? null,
            sourceIssueId: input.sourceIssueId ?? null,
            createdAt: now,
            updatedAt: now,
          })
          .returning();

        return {
          id: entry.id,
          companyId,
          documentId: document.id,
          folderId: entry.folderId,
          title: entry.title,
          format: document.format,
          body: document.latestBody,
          latestRevisionId: revision.id,
          latestRevisionNumber: 1,
          sourceProjectId: entry.sourceProjectId,
          sourceIssueId: entry.sourceIssueId,
          position: entry.position,
          createdAt: entry.createdAt,
          updatedAt: entry.updatedAt,
        };
      });
    },

    updateDocument: async (
      companyId: string,
      entryId: string,
      input: {
        folderId?: string | null;
        title?: string | null;
        body?: string;
        changeSummary?: string | null;
        baseRevisionId?: string | null;
        sourceProjectId?: string | null;
        sourceIssueId?: string | null;
        position?: number;
        updatedByAgentId?: string | null;
        updatedByUserId?: string | null;
      },
    ) => {
      await assertFolder(companyId, input.folderId);
      await assertSourceRefs(companyId, input.sourceProjectId, input.sourceIssueId);

      return db.transaction(async (tx) => {
        const existing = await tx
          .select(companyDocumentSelect)
          .from(companyDocuments)
          .innerJoin(documents, eq(companyDocuments.documentId, documents.id))
          .where(and(eq(companyDocuments.companyId, companyId), eq(companyDocuments.id, entryId)))
          .then((rows) => rows[0] ?? null);
        if (!existing) return null;
        if (existing.latestRevisionId && input.body !== undefined && !input.baseRevisionId) {
          throw conflict("Document update requires baseRevisionId", {
            currentRevisionId: existing.latestRevisionId,
          });
        }
        if (input.body !== undefined && input.baseRevisionId !== existing.latestRevisionId) {
          throw conflict("Document was updated by someone else", {
            currentRevisionId: existing.latestRevisionId,
          });
        }

        const now = new Date();
        let latestRevisionId = existing.latestRevisionId;
        let latestRevisionNumber = existing.latestRevisionNumber;
        const nextTitle = input.title !== undefined ? input.title : existing.title;
        const nextBody = input.body ?? existing.body;

        if (input.body !== undefined || input.title !== undefined) {
          latestRevisionNumber += 1;
          const [revision] = await tx
            .insert(documentRevisions)
            .values({
              companyId,
              documentId: existing.documentId,
              revisionNumber: latestRevisionNumber,
              title: nextTitle ?? null,
              format: existing.format,
              body: nextBody,
              changeSummary: input.changeSummary ?? null,
              createdByAgentId: input.updatedByAgentId ?? null,
              createdByUserId: input.updatedByUserId ?? null,
              createdAt: now,
            })
            .returning();
          latestRevisionId = revision.id;

          await tx
            .update(documents)
            .set({
              title: nextTitle ?? null,
              latestBody: nextBody,
              latestRevisionId,
              latestRevisionNumber,
              updatedByAgentId: input.updatedByAgentId ?? null,
              updatedByUserId: input.updatedByUserId ?? null,
              updatedAt: now,
            })
            .where(eq(documents.id, existing.documentId));
        }

        await tx
          .update(companyDocuments)
          .set({
            ...(input.folderId !== undefined ? { folderId: input.folderId } : {}),
            ...(input.title !== undefined ? { title: input.title } : {}),
            ...(input.sourceProjectId !== undefined ? { sourceProjectId: input.sourceProjectId } : {}),
            ...(input.sourceIssueId !== undefined ? { sourceIssueId: input.sourceIssueId } : {}),
            ...(input.position !== undefined ? { position: input.position } : {}),
            updatedAt: now,
          })
          .where(eq(companyDocuments.id, entryId));

        return {
          ...existing,
          folderId: input.folderId !== undefined ? input.folderId : existing.folderId,
          title: nextTitle,
          body: nextBody,
          latestRevisionId,
          latestRevisionNumber,
          sourceProjectId: input.sourceProjectId !== undefined ? input.sourceProjectId : existing.sourceProjectId,
          sourceIssueId: input.sourceIssueId !== undefined ? input.sourceIssueId : existing.sourceIssueId,
          position: input.position !== undefined ? input.position : existing.position,
          updatedAt: now,
        };
      });
    },

    deleteDocument: async (companyId: string, entryId: string) => {
      return db.transaction(async (tx) => {
        const existing = await tx
          .select(companyDocumentSelect)
          .from(companyDocuments)
          .innerJoin(documents, eq(companyDocuments.documentId, documents.id))
          .where(and(eq(companyDocuments.companyId, companyId), eq(companyDocuments.id, entryId)))
          .then((rows) => rows[0] ?? null);
        if (!existing) return null;
        await tx.delete(companyDocuments).where(eq(companyDocuments.id, entryId));
        await tx.delete(documents).where(eq(documents.id, existing.documentId));
        return mapCompanyDocumentRow(existing);
      });
    },
  };
}
