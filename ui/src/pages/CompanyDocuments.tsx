import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Folder, Plus, Save, Trash2 } from "lucide-react";
import type { CompanyDocumentEntry, CompanyDocumentEntrySummary, CompanyDocumentFolder } from "@paperclipai/shared";
import { companyDocumentsApi } from "../api/companyDocuments";
import { useCompany } from "../context/CompanyContext";
import { useToastActions } from "../context/ToastContext";
import { queryKeys } from "../lib/queryKeys";
import { MarkdownBody } from "../components/MarkdownBody";
import { PageSkeleton } from "../components/PageSkeleton";
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

  const foldersById = useMemo(() => {
    return new Map((libraryQuery.data?.folders ?? []).map((folder) => [folder.id, folder]));
  }, [libraryQuery.data?.folders]);
  const showMutationError = (title: string, error: unknown) => {
    toast.pushToast({
      title,
      body: error instanceof Error ? error.message : undefined,
      tone: "error",
    });
  };

  const documents = libraryQuery.data?.documents ?? [];
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

  if (!selectedCompanyId) return <p className="text-sm text-muted-foreground">Select a company to view documents.</p>;
  if (libraryQuery.isLoading) return <PageSkeleton variant="list" />;
  if (libraryQuery.error) return <p className="text-sm text-destructive">{libraryQuery.error.message}</p>;

  return (
    <div className="flex min-h-[calc(100vh-4rem)] gap-6">
      <aside className="w-80 shrink-0 border-r border-border pr-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Documents</h1>
            <p className="text-sm text-muted-foreground">Company goals, project notes, and saved outputs.</p>
          </div>
          <Button size="sm" onClick={resetDraft}>
            <Plus className="mr-2 h-4 w-4" />
            New
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
            size="sm"
            disabled={!newFolderName.trim() || createFolder.isPending}
            onClick={() => createFolder.mutate()}
          >
            <Folder className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-1">
          {documents.length === 0 ? (
            <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
              No documents yet.
            </p>
          ) : (
            documents.map((document) => (
              <button
                key={document.id}
                onClick={() => {
                  setSelectedId(document.id);
                  setDraftTitle("");
                  setDraftBody("");
                }}
                className={`flex w-full items-start gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                  selectedId === document.id ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
                }`}
              >
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{document.title ?? "Untitled"}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {document.folderId ? folderLabel(foldersById.get(document.folderId)!, foldersById) : "Root"}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        {selectedDocument ? (
          <DocumentEditor
            document={selectedDocument}
            folders={libraryQuery.data?.folders ?? []}
            foldersById={foldersById}
            onSave={(title, body) => updateDocument.mutate({ document: selectedDocument, title, body })}
            onDelete={() => deleteDocument.mutate(selectedDocument)}
            saving={updateDocument.isPending}
            deleting={deleteDocument.isPending}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <section className="space-y-3">
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
              <MarkdownBody className="text-sm" softBreaks={false}>{draftBody}</MarkdownBody>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

function DocumentEditor({
  document,
  folders,
  foldersById,
  onSave,
  onDelete,
  saving,
  deleting,
}: {
  document: CompanyDocumentEntry;
  folders: CompanyDocumentFolder[];
  foldersById: Map<string, CompanyDocumentFolder>;
  onSave: (title: string, body: string) => void;
  onDelete: () => void;
  saving: boolean;
  deleting: boolean;
}) {
  const [title, setTitle] = useState(document.title ?? "Untitled");
  const [body, setBody] = useState(document.body);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="space-y-3">
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
          {document.folderId ? folderLabel(foldersById.get(document.folderId)!, foldersById) : "Root"} · revision{" "}
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
      <datalist id="document-folders">
        {folders.map((folder) => (
          <option key={folder.id} value={folderLabel(folder, foldersById)} />
        ))}
      </datalist>
    </div>
  );
}
