import { Router } from "express";
import type { Db } from "@paperclipai/db";
import {
  createCompanyDocumentFolderSchema,
  createCompanyDocumentSchema,
  updateCompanyDocumentFolderSchema,
  updateCompanyDocumentSchema,
} from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { companyDocumentService, logActivity } from "../services/index.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";

export function companyDocumentRoutes(db: Db) {
  const router = Router();
  const svc = companyDocumentService(db);

  router.get("/companies/:companyId/documents", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    res.json(await svc.listLibrary(companyId));
  });

  router.post("/companies/:companyId/document-folders", validate(createCompanyDocumentFolderSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const folder = await svc.createFolder(companyId, req.body);
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "company_document.folder_created",
      entityType: "company_document_folder",
      entityId: folder.id,
      details: { name: folder.name, parentId: folder.parentId },
    });
    res.status(201).json(folder);
  });

  router.patch(
    "/companies/:companyId/document-folders/:folderId",
    validate(updateCompanyDocumentFolderSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const folderId = req.params.folderId as string;
      assertCompanyAccess(req, companyId);
      const folder = await svc.updateFolder(companyId, folderId, req.body);
      if (!folder) {
        res.status(404).json({ error: "Document folder not found" });
        return;
      }
      const actor = getActorInfo(req);
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        action: "company_document.folder_updated",
        entityType: "company_document_folder",
        entityId: folder.id,
        details: { changedKeys: Object.keys(req.body).sort() },
      });
      res.json(folder);
    },
  );

  router.delete("/companies/:companyId/document-folders/:folderId", async (req, res) => {
    const companyId = req.params.companyId as string;
    const folderId = req.params.folderId as string;
    assertCompanyAccess(req, companyId);
    const folder = await svc.deleteFolder(companyId, folderId);
    if (!folder) {
      res.status(404).json({ error: "Document folder not found" });
      return;
    }
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "company_document.folder_deleted",
      entityType: "company_document_folder",
      entityId: folder.id,
      details: { name: folder.name },
    });
    res.json(folder);
  });

  router.post("/companies/:companyId/documents", validate(createCompanyDocumentSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const actor = getActorInfo(req);
    const document = await svc.createDocument(companyId, {
      ...req.body,
      createdByAgentId: actor.agentId,
      createdByUserId: actor.actorType === "user" ? actor.actorId : null,
    });
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "company_document.created",
      entityType: "company_document",
      entityId: document.id,
      details: {
        title: document.title,
        folderId: document.folderId,
        sourceProjectId: document.sourceProjectId,
        sourceIssueId: document.sourceIssueId,
      },
    });
    res.status(201).json(document);
  });

  router.get("/companies/:companyId/documents/:documentEntryId", async (req, res) => {
    const companyId = req.params.companyId as string;
    const documentEntryId = req.params.documentEntryId as string;
    assertCompanyAccess(req, companyId);
    const document = await svc.getDocument(companyId, documentEntryId);
    if (!document) {
      res.status(404).json({ error: "Document not found" });
      return;
    }
    res.json(document);
  });

  router.patch(
    "/companies/:companyId/documents/:documentEntryId",
    validate(updateCompanyDocumentSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const documentEntryId = req.params.documentEntryId as string;
      assertCompanyAccess(req, companyId);
      const actor = getActorInfo(req);
      const document = await svc.updateDocument(companyId, documentEntryId, {
        ...req.body,
        updatedByAgentId: actor.agentId,
        updatedByUserId: actor.actorType === "user" ? actor.actorId : null,
      });
      if (!document) {
        res.status(404).json({ error: "Document not found" });
        return;
      }
      await logActivity(db, {
        companyId,
        actorType: actor.actorType,
        actorId: actor.actorId,
        agentId: actor.agentId,
        action: "company_document.updated",
        entityType: "company_document",
        entityId: document.id,
        details: { changedKeys: Object.keys(req.body).sort() },
      });
      res.json(document);
    },
  );

  router.delete("/companies/:companyId/documents/:documentEntryId", async (req, res) => {
    const companyId = req.params.companyId as string;
    const documentEntryId = req.params.documentEntryId as string;
    assertCompanyAccess(req, companyId);
    const document = await svc.deleteDocument(companyId, documentEntryId);
    if (!document) {
      res.status(404).json({ error: "Document not found" });
      return;
    }
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "company_document.deleted",
      entityType: "company_document",
      entityId: document.id,
      details: { title: document.title },
    });
    res.json(document);
  });

  return router;
}
