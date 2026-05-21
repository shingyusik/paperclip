import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Folder } from "lucide-react";
import type { CompanyDocumentEntry, CompanyDocumentEntrySummary, CompanyDocumentFolder } from "@paperclipai/shared";
import { companyDocumentsApi } from "../api/companyDocuments";
import { useCompany } from "../context/CompanyContext";
import { queryKeys } from "../lib/queryKeys";
import { MarkdownBody } from "../components/MarkdownBody";

function folderLabel(folder: CompanyDocumentFolder, foldersById: Map<string, CompanyDocumentFolder>) {
  const names = [folder.name];
  let parentId = folder.parentId;
  while (parentId) {
    const parent = foldersById.get(parentId);
    if (!parent) break;
    names.unshift(parent.name);
    parentId = parent.parentId;
  }
  return names.join(" / ");
}

function documentFileName(document: Pick<CompanyDocumentEntrySummary, "title">) {
  const title = document.title?.trim() || "Untitled";
  return title.toLowerCase().endsWith(".md") ? title : `${title}.md`;
}

function childFolders(parentId: string | null, folders: CompanyDocumentFolder[]) {
  return folders
    .filter((folder) => folder.parentId === parentId)
    .sort((left, right) => left.name.localeCompare(right.name));
}

function childDocuments(parentId: string | null, documents: CompanyDocumentEntrySummary[]) {
  return documents
    .filter((document) => document.folderId === parentId)
    .sort((left, right) => (left.title ?? "").localeCompare(right.title ?? ""));
}

export function CompanyDocuments() {
  const { selectedCompanyId } = useCompany();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const libraryQuery = useQuery({
    queryKey: selectedCompanyId ? queryKeys.companyDocuments.list(selectedCompanyId) : ["company-documents", "missing"],
    queryFn: () => companyDocumentsApi.list(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
  });

  const documentQuery = useQuery({
    queryKey: selectedCompanyId && selectedId
      ? queryKeys.companyDocuments.detail(selectedCompanyId, selectedId)
      : ["company-documents", "missing-detail"],
    queryFn: () => companyDocumentsApi.get(selectedCompanyId!, selectedId!),
    enabled: Boolean(selectedCompanyId && selectedId),
  });

  const folders = libraryQuery.data?.folders ?? [];
  const documents = libraryQuery.data?.documents ?? [];
  const foldersById = useMemo(() => {
    return new Map(folders.map((folder) => [folder.id, folder]));
  }, [folders]);

  const selectedDocument = documentQuery.data ?? null;

  useEffect(() => {
    if (!selectedCompanyId || documents.length === 0) {
      setSelectedId(null);
      return;
    }

    if (!selectedId || !documents.some((document) => document.id === selectedId)) {
      setSelectedId(documents[0]!.id);
    }
  }, [documents, selectedCompanyId, selectedId]);

  return (
    <div className="flex min-h-[calc(100vh-4rem)] gap-0">
      <aside className="flex w-80 shrink-0 flex-col border-r border-border pr-4">
        <div className="mb-4">
          <h1 className="text-xl font-semibold">Documents</h1>
          <p className="text-xs text-muted-foreground">Company goals, notes, and saved outputs.</p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-muted/10 p-2">
          <DocumentTree
            folders={folders}
            documents={documents}
            selectedId={selectedId}
            isLoading={libraryQuery.isLoading}
            hasCompany={Boolean(selectedCompanyId)}
            onSelect={(document) => setSelectedId(document.id)}
          />
        </div>
      </aside>

      <main className="min-w-0 flex-1 pl-6">
        {!selectedCompanyId ? (
          <p className="mb-4 text-sm text-muted-foreground">Select a company to view documents.</p>
        ) : null}
        {libraryQuery.error ? (
          <p className="mb-4 text-sm text-destructive">{libraryQuery.error.message}</p>
        ) : null}
        {!selectedCompanyId ? null : selectedDocument ? (
          <DocumentViewer
            document={selectedDocument}
            foldersById={foldersById}
          />
        ) : documentQuery.isLoading ? (
          <ViewerEmptyState message="Loading document..." />
        ) : (
          <ViewerEmptyState message={documents.length === 0 ? "No documents yet." : "Select a document."} />
        )}
      </main>
    </div>
  );
}

function DocumentTree({
  folders,
  documents,
  selectedId,
  isLoading,
  hasCompany,
  onSelect,
}: {
  folders: CompanyDocumentFolder[];
  documents: CompanyDocumentEntrySummary[];
  selectedId: string | null;
  isLoading: boolean;
  hasCompany: boolean;
  onSelect: (document: CompanyDocumentEntrySummary) => void;
}) {
  if (!hasCompany) {
    return <div className="px-2 py-6 text-center text-xs text-muted-foreground">No company selected.</div>;
  }

  if (isLoading) {
    return <div className="px-2 py-6 text-center text-xs text-muted-foreground">Loading documents...</div>;
  }

  return (
    <div className="space-y-1 text-sm">
      <TreeFolder
        name="Root"
        folderId={null}
        folders={folders}
        documents={documents}
        selectedId={selectedId}
        onSelect={onSelect}
        depth={0}
      />
    </div>
  );
}

function TreeFolder({
  name,
  folderId,
  folders,
  documents,
  selectedId,
  onSelect,
  depth,
}: {
  name: string;
  folderId: string | null;
  folders: CompanyDocumentFolder[];
  documents: CompanyDocumentEntrySummary[];
  selectedId: string | null;
  onSelect: (document: CompanyDocumentEntrySummary) => void;
  depth: number;
}) {
  const nestedFolders = childFolders(folderId, folders);
  const nestedDocuments = childDocuments(folderId, documents);

  return (
    <div>
      <div
        className="flex items-center gap-2 rounded px-2 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground"
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
      >
        <Folder className="h-4 w-4 shrink-0" />
        <span className="truncate">{name}</span>
      </div>
      <div className="space-y-0.5">
        {nestedFolders.map((folder) => (
          <TreeFolder
            key={folder.id}
            name={folder.name}
            folderId={folder.id}
            folders={folders}
            documents={documents}
            selectedId={selectedId}
            onSelect={onSelect}
            depth={depth + 1}
          />
        ))}
        {nestedDocuments.map((document) => (
          <button
            key={document.id}
            onClick={() => onSelect(document)}
            className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors ${
              selectedId === document.id ? "bg-accent text-accent-foreground" : "text-foreground/80 hover:bg-accent/50"
            }`}
            style={{ paddingLeft: `${(depth + 1) * 14 + 8}px` }}
          >
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{documentFileName(document)}</span>
          </button>
        ))}
        {depth === 0 && nestedFolders.length === 0 && nestedDocuments.length === 0 ? (
          <div className="px-2 py-6 text-center text-xs text-muted-foreground">
            No documents yet.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ViewerEmptyState({ message }: { message: string }) {
  return (
    <div className="flex min-h-[520px] items-center justify-center border border-dashed border-border text-sm text-muted-foreground">
      {message}
    </div>
  );
}

function DocumentViewer({
  document,
  foldersById,
}: {
  document: CompanyDocumentEntry;
  foldersById: Map<string, CompanyDocumentFolder>;
}) {
  return (
    <article className="min-w-0">
      <header className="mb-5 border-b border-border pb-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FileText className="h-4 w-4" />
          <span className="truncate">{documentFileName(document)}</span>
        </div>
        <h2 className="mt-2 text-2xl font-semibold">{document.title ?? "Untitled"}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {document.folderId ? folderLabel(foldersById.get(document.folderId)!, foldersById) : "Root"} / revision{" "}
          {document.latestRevisionNumber}
        </p>
      </header>
      <MarkdownBody className="max-w-none text-sm" softBreaks={false}>{document.body}</MarkdownBody>
    </article>
  );
}
