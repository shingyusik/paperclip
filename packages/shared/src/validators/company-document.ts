import { z } from "zod";
import { issueDocumentFormatSchema } from "./issue.js";

const optionalUuidSchema = z.string().uuid().nullable().optional();

export const createCompanyDocumentFolderSchema = z.object({
  parentId: optionalUuidSchema,
  name: z.string().trim().min(1).max(160),
  position: z.number().int().min(0).optional(),
});

export const updateCompanyDocumentFolderSchema = z.object({
  parentId: optionalUuidSchema,
  name: z.string().trim().min(1).max(160).optional(),
  position: z.number().int().min(0).optional(),
});

export const createCompanyDocumentSchema = z.object({
  folderId: optionalUuidSchema,
  title: z.string().trim().min(1).max(200).nullable().optional(),
  format: issueDocumentFormatSchema.default("markdown"),
  body: z.string().max(524288),
  sourceProjectId: optionalUuidSchema,
  sourceIssueId: optionalUuidSchema,
  position: z.number().int().min(0).optional(),
});

export const updateCompanyDocumentSchema = z.object({
  folderId: optionalUuidSchema,
  title: z.string().trim().min(1).max(200).nullable().optional(),
  body: z.string().max(524288).optional(),
  changeSummary: z.string().trim().max(500).nullable().optional(),
  baseRevisionId: z.string().uuid().nullable().optional(),
  sourceProjectId: optionalUuidSchema,
  sourceIssueId: optionalUuidSchema,
  position: z.number().int().min(0).optional(),
});

export type CreateCompanyDocumentFolder = z.infer<typeof createCompanyDocumentFolderSchema>;
export type UpdateCompanyDocumentFolder = z.infer<typeof updateCompanyDocumentFolderSchema>;
export type CreateCompanyDocument = z.infer<typeof createCompanyDocumentSchema>;
export type UpdateCompanyDocument = z.infer<typeof updateCompanyDocumentSchema>;
