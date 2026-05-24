import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateMeetingRoom, MeetingRoom, MeetingRoomListQuery } from "@paperclipai/shared";
import { MessageSquareText, Plus } from "lucide-react";
import { Tabs } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { meetingRoomsApi } from "../api/meeting-rooms";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { PageTabBar } from "../components/PageTabBar";
import { StatusBadge } from "../components/StatusBadge";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useCompany } from "../context/CompanyContext";
import { useLocation, useNavigate } from "../lib/router";
import { queryKeys } from "../lib/queryKeys";
import { cn, relativeTime } from "../lib/utils";

type MeetingRoomTab = "open" | "all";

function getMeetingRoomTab(pathname: string): MeetingRoomTab {
  return pathname.split("/").filter(Boolean).pop() === "all" ? "all" : "open";
}

function buildCreatePayload(title: string, description: string): CreateMeetingRoom {
  const payload: CreateMeetingRoom = { title: title.trim() };
  const trimmedDescription = description.trim();
  if (trimmedDescription) payload.description = trimmedDescription;
  return payload;
}

function contextChips(room: MeetingRoom) {
  return [
    room.projectId ? { label: "Project", value: room.projectId } : null,
    room.issueId ? { label: "Issue", value: room.issueId } : null,
    room.projectDocumentId ? { label: "Document", value: room.projectDocumentId } : null,
  ].filter((chip): chip is { label: string; value: string } => Boolean(chip));
}

function roomTimestamp(room: MeetingRoom) {
  if (room.lastMessageAt) return `Last message ${relativeTime(room.lastMessageAt)}`;
  return `Created ${relativeTime(room.createdAt)}`;
}

function MeetingRoomRow({ room }: { room: MeetingRoom }) {
  const chips = contextChips(room);

  return (
    <div className="border-b border-border px-4 py-3 last:border-b-0">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-sm font-medium">{room.title}</h2>
            <StatusBadge status={room.status} />
          </div>
          {room.description ? (
            <p className="text-sm text-muted-foreground">{room.description}</p>
          ) : null}
          {chips.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {chips.map((chip) => (
                <span
                  key={`${chip.label}:${chip.value}`}
                  className="inline-flex max-w-full items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-xs text-muted-foreground"
                >
                  <span>{chip.label} </span>
                  <span className="truncate font-mono">{chip.value}</span>
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">{roomTimestamp(room)}</span>
      </div>
    </div>
  );
}

export function MeetingRooms() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const activeTab = getMeetingRoomTab(location.pathname);
  const filters = useMemo<MeetingRoomListQuery | undefined>(
    () => (activeTab === "open" ? { status: "open" } : undefined),
    [activeTab],
  );

  useEffect(() => {
    setBreadcrumbs([{ label: "Meeting Rooms" }]);
  }, [setBreadcrumbs]);

  const { data: rooms, isLoading, error } = useQuery({
    queryKey: queryKeys.meetingRooms.list(selectedCompanyId!, filters),
    queryFn: () => meetingRoomsApi.list(selectedCompanyId!, filters),
    enabled: !!selectedCompanyId,
  });

  const createRoom = useMutation({
    mutationFn: () => meetingRoomsApi.create(selectedCompanyId!, buildCreatePayload(title, description)),
    onSuccess: async () => {
      setTitle("");
      setDescription("");
      if (selectedCompanyId) {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.meetingRooms.lists(selectedCompanyId),
        });
      }
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCompanyId || !title.trim() || createRoom.isPending) return;
    createRoom.mutate();
  }

  if (!selectedCompanyId) {
    return <EmptyState icon={MessageSquareText} message="Select a company to view meeting rooms." />;
  }

  if (isLoading) {
    return <PageSkeleton variant="list" />;
  }

  const list = rooms ?? [];
  const emptyMessage = activeTab === "open" ? "No open meeting rooms." : "No meeting rooms yet.";

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={activeTab} onValueChange={(value) => navigate(`/meeting-rooms/${value}`)}>
          <PageTabBar
            items={[
              { value: "open", label: "Open" },
              { value: "all", label: "All" },
            ]}
            value={activeTab}
            onValueChange={(value) => navigate(`/meeting-rooms/${value}`)}
            align="start"
          />
        </Tabs>
      </div>

      <p className="text-sm text-muted-foreground">
        Meeting rooms coordinate context and do not auto-run agents.
      </p>

      <form onSubmit={handleSubmit} className="space-y-3 border border-border p-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Plus className="h-4 w-4" />
          New meeting room
        </div>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto] md:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="meeting-room-title">Title</Label>
            <Input
              id="meeting-room-title"
              name="title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Strategy sync"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="meeting-room-description">Description</Label>
            <Textarea
              id="meeting-room-description"
              name="description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Optional context"
              className="min-h-9 md:h-9"
            />
          </div>
          <Button type="submit" disabled={!title.trim() || createRoom.isPending}>
            Create
          </Button>
        </div>
        {createRoom.error ? (
          <p className="text-sm text-destructive">{createRoom.error.message}</p>
        ) : null}
      </form>

      {error ? <p className="text-sm text-destructive">{error.message}</p> : null}

      {list.length === 0 ? (
        <EmptyState icon={MessageSquareText} message={emptyMessage} />
      ) : (
        <div className={cn("border border-border", createRoom.isPending && "opacity-70")}>
          {list.map((room) => (
            <MeetingRoomRow key={room.id} room={room} />
          ))}
        </div>
      )}
    </div>
  );
}
