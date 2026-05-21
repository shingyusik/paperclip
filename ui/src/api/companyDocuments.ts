import type {
  CompanyDocumentEntry,
  CompanyDocumentFolder,
  CompanyDocumentLibrary,
} from "@paperclipai/shared";
import { api } from "./client";

export const companyDocumentsApi = {
  list: (companyId: string) =>
    api.get<CompanyDocumentLibrary>(`/companies/${encodeURIComponent(companyId)}/documents`),
  get: (companyId: string, documentEntryId: string) =>
    api.get<CompanyDocumentEntry>(
      `/companies/${encodeURIComponent(companyId)}/documents/${encodeURIComponent(documentEntryId)}`,
    ),
  createFolder: (companyId: string, data: Record<string, unknown>) =>
    api.post<CompanyDocumentFolder>(`/companies/${encodeURIComponent(companyId)}/document-folders`, data),
  updateFolder: (companyId: string, folderId: string, data: Record<string, unknown>) =>
    api.patch<CompanyDocumentFolder>(
      `/companies/${encodeURIComponent(companyId)}/document-folders/${encodeURIComponent(folderId)}`,
      data,
    ),
  deleteFolder: (companyId: string, folderId: string) =>
    api.delete<CompanyDocumentFolder>(
      `/companies/${encodeURIComponent(companyId)}/document-folders/${encodeURIComponent(folderId)}`,
    ),
  create: (companyId: string, data: Record<string, unknown>) =>
    api.post<CompanyDocumentEntry>(`/companies/${encodeURIComponent(companyId)}/documents`, data),
  update: (companyId: string, documentEntryId: string, data: Record<string, unknown>) =>
    api.patch<CompanyDocumentEntry>(
      `/companies/${encodeURIComponent(companyId)}/documents/${encodeURIComponent(documentEntryId)}`,
      data,
    ),
  delete: (companyId: string, documentEntryId: string) =>
    api.delete<CompanyDocumentEntry>(
      `/companies/${encodeURIComponent(companyId)}/documents/${encodeURIComponent(documentEntryId)}`,
    ),
};
