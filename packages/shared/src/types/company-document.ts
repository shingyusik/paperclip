import type { DocumentFormat } from "./issue.js";

export interface CompanyDocumentFolder {
  id: string;
  companyId: string;
  parentId: string | null;
  name: string;
  position: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CompanyDocumentEntrySummary {
  id: string;
  companyId: string;
  documentId: string;
  folderId: string | null;
  title: string | null;
  format: DocumentFormat;
  latestRevisionId: string | null;
  latestRevisionNumber: number;
  sourceProjectId: string | null;
  sourceIssueId: string | null;
  position: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CompanyDocumentEntry extends CompanyDocumentEntrySummary {
  body: string;
}

export interface CompanyDocumentLibrary {
  folders: CompanyDocumentFolder[];
  documents: CompanyDocumentEntrySummary[];
}
