import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FilePlus, FileText, Folder, FolderPlus, Plus, Save, Trash2 } from "lucide-react";
import type { CompanyDocumentEntry, CompanyDocumentEntrySummary, CompanyDocumentFolder } from "@paperclipai/shared";
import { companyDocumentsApi } from "../api/companyDocuments";
import { useCompany } from "../context/CompanyContext";
import { useToastActions } from "../context/ToastContext";
import { queryKeys } from "../lib/queryKeys";
import { MarkdownBody } from "../components/MarkdownBody";
import { Button } from "@/components/ui/button";

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
  const queryClient = useQueryClient();
  const toast = useToastActions();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");

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
  const showMutationError = (title: string, error: unknown) => {
    toast.pushToast({
      title,
      body: error instanceof Error ? error.message : undefined,
      tone: "error",
    });
  };

  const selectedDocument = documentQuery.data ?? null;

  const resetDraft = () => {
    setSelectedId(null);
    setDraftTitle("");
    setDraftBody("");
    setSelectedFolderId(null);
  };

  const createFolder = useMutation({
    mutationFn: () => companyDocumentsApi.createFolder(selectedCompanyId!, { name: newFolderName.trim() }),
    onSuccess: () => {
      setNewFolderName("");
      queryClient.invalidateQueries({ queryKey: queryKeys.companyDocuments.list(selectedCompanyId!) });
    },
    onError: (error) => showMutationError("Folder creation failed", error),
  });

  const createDocument = useMutation({
    mutationFn: () =>
      companyDocumentsApi.create(selectedCompanyId!, {
        title: draftTitle.trim() || "Untitled",
        body: draftBody,
        format: "markdown",
        folderId: selectedFolderId,
      }),
    onSuccess: (document) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companyDocuments.list(selectedCompanyId!) });
      setSelectedId(document.id);
      setDraftTitle("");
      setDraftBody("");
    },
    onError: (error) => showMutationError("Document creation failed", error),
  });

  const updateDocument = useMutation({
    mutationFn: (input: { document: CompanyDocumentEntry; title: string; body: string }) =>
      companyDocumentsApi.update(selectedCompanyId!, input.document.id, {
        title: input.title.trim() || "Untitled",
        body: input.body,
        baseRevisionId: input.document.latestRevisionId,
      }),
    onSuccess: (document) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companyDocuments.list(selectedCompanyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.companyDocuments.detail(selectedCompanyId!, document.id) });
    },
    onError: (error) => showMutationError("Document save failed", error),
  });

  const deleteDocument = useMutation({
    mutationFn: (document: CompanyDocumentEntrySummary) =>
      companyDocumentsApi.delete(selectedCompanyId!, document.id),
    onSuccess: () => {
      resetDraft();
      queryClient.invalidateQueries({ queryKey: queryKeys.companyDocuments.list(selectedCompanyId!) });
    },
    onError: (error) => showMutationError("Document deletion failed", error),
  });

  return (
    <div className="flex min-h-[calc(100vh-4rem)] gap-6">
      <aside className="flex w-80 shrink-0 flex-col border-r border-border pr-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Documents</h1>
            <p className="text-xs text-muted-foreground">Company goals, notes, and saved outputs.</p>
          </div>
          <Button size="icon-sm" onClick={resetDraft} title="New document" aria-label="New document">
            <FilePlus className="h-4 w-4" />
          </Button>
        </div>

        <div className="mb-4 flex gap-2">
          <input
            value={newFolderName}
            onChange={(event) => setNewFolderName(event.target.value)}
            className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder="New folder"
          />
          <Button
            variant="secondary"
            size="icon-sm"
            disabled={!newFolderName.trim() || createFolder.isPending}
            onClick={() => createFolder.mutate()}
            title="New folder"
            aria-label="New folder"
          >
            <FolderPlus className="h-4 w-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border bg-muted/10 p-2">
          <DocumentTree
            folders={folders}
            documents={documents}
            selectedId={selectedId}
            isLoading={libraryQuery.isLoading}
            hasCompany={Boolean(selectedCompanyId)}
            onSelect={(document) => {
              setSelectedId(document.id);
              setDraftTitle("");
              setDraftBody("");
            }}
          />
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        {!selectedCompanyId ? (
          <p className="mb-4 text-sm text-muted-foreground">Select a company to view documents.</p>
        ) : null}
        {libraryQuery.error ? (
          <p className="mb-4 text-sm text-destructive">{libraryQuery.error.message}</p>
        ) : null}
        {!selectedCompanyId ? null : selectedDocument ? (
          <DocumentEditor
            document={selectedDocument}
            foldersById={foldersById}
            onSave={(title, body) => updateDocument.mutate({ document: selectedDocument, title, body })}
            onDelete={() => deleteDocument.mutate(selectedDocument)}
            saving={updateDocument.isPending}
            deleting={deleteDocument.isPending}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <section className="space-y-3">
              <div className="flex items-center gap-2 border-b border-border pb-3">
                <Plus className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">New markdown document</span>
              </div>
              <input
                value={draftTitle}
                onChange={(event) => setDraftTitle(event.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-lg font-semibold"
                placeholder="Document title"
              />
              <select
                value={selectedFolderId ?? ""}
                onChange={(event) => setSelectedFolderId(event.target.value || null)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Root</option>
                {(libraryQuery.data?.folders ?? []).map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folderLabel(folder, foldersById)}
                  </option>
                ))}
              </select>
              <textarea
                value={draftBody}
                onChange={(event) => setDraftBody(event.target.value)}
                className="min-h-[520px] w-full resize-y rounded-md border border-input bg-background px-3 py-3 font-mono text-sm"
                placeholder="# Notes"
              />
              <Button disabled={!draftBody.trim() || createDocument.isPending} onClick={() => createDocument.mutate()}>
                <Save className="mr-2 h-4 w-4" />
                Save document
              </Button>
            </section>
            <section className="min-w-0 rounded-md border border-border p-4">
              {draftBody.trim() ? (
                <MarkdownBody className="text-sm" softBreaks={false}>{draftBody}</MarkdownBody>
              ) : (
                <div className="flex min-h-[520px] items-center justify-center text-sm text-muted-foreground">
                  Write markdown to preview the rendered document.
                </div>
              )}
            </section>
          </div>
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

function DocumentEditor({
  document,
  foldersById,
  onSave,
  onDelete,
  saving,
  deleting,
}: {
  document: CompanyDocumentEntry;
  foldersById: Map<string, CompanyDocumentFolder>;
  onSave: (title: string, body: string) => void;
  onDelete: () => void;
  saving: boolean;
  deleting: boolean;
}) {
  const [title, setTitle] = useState(document.title ?? "Untitled");
  const [body, setBody] = useState(document.body);

  useEffect(() => {
    setTitle(document.title ?? "Untitled");
    setBody(document.body);
  }, [document.id, document.body, document.title]);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="space-y-3">
        <div className="flex items-center gap-2 border-b border-border pb-3 text-sm text-muted-foreground">
          <FileText className="h-4 w-4" />
          <span className="truncate">{documentFileName(document)}</span>
        </div>
        <div className="flex gap-2">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-lg font-semibold"
          />
          <Button variant="secondary" disabled={saving} onClick={() => onSave(title, body)}>
            <Save className="mr-2 h-4 w-4" />
            Save
          </Button>
          <Button variant="ghost" disabled={deleting} onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {document.folderId ? folderLabel(foldersById.get(document.folderId)!, foldersById) : "Root"} / revision{" "}
          {document.latestRevisionNumber}
        </p>
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          className="min-h-[560px] w-full resize-y rounded-md border border-input bg-background px-3 py-3 font-mono text-sm"
        />
      </section>
      <section className="min-w-0 rounded-md border border-border p-4">
        <MarkdownBody className="text-sm" softBreaks={false}>{body}</MarkdownBody>
      </section>
    </div>
  );
}
