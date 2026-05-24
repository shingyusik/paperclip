import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateMeetingRoom,
  MeetingMessage,
  MeetingParticipant,
  MeetingRoom,
  MeetingRoomListQuery,
} from "@paperclipai/shared";
import { ChevronDown, MessageSquareText, Plus, Send } from "lucide-react";
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

function canInvokeParticipant(room: MeetingRoom, participant: MeetingParticipant) {
  return (
    room.status === "open"
    && participant.participantType === "agent"
    && Boolean(participant.agentId)
    && (participant.status === "active" || participant.status === "invited")
  );
}

function messageTypeLabel(message: MeetingMessage) {
  const messageType = String(message.messageType);
  if (messageType === "agent_response") return "Agent response";
  return messageType.replace(/_/g, " ");
}

function messageExcerpt(body: string) {
  const trimmed = body.trim();
  if (trimmed.length <= 280) return trimmed;
  return `${trimmed.slice(0, 277)}...`;
}

function MeetingRoomDetails({ companyId, room }: { companyId: string; room: MeetingRoom }) {
  const queryClient = useQueryClient();
  const messagesOptions = useMemo(() => ({ limit: 10 }), []);

  const detailQuery = useQuery({
    queryKey: queryKeys.meetingRooms.detail(companyId, room.id),
    queryFn: () => meetingRoomsApi.get(companyId, room.id),
  });
  const messagesQuery = useQuery({
    queryKey: queryKeys.meetingRooms.messages(companyId, room.id, messagesOptions),
    queryFn: () => meetingRoomsApi.listMessages(companyId, room.id, messagesOptions),
  });

  const invokeParticipant = useMutation({
    mutationFn: (participantId: string) =>
      meetingRoomsApi.invokeParticipant(companyId, room.id, participantId, {
        reason: "Explicit meeting-room agent invocation",
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.meetingRooms.lists(companyId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.meetingRooms.detail(companyId, room.id) }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.meetingRooms.messages(companyId, room.id, messagesOptions),
        }),
      ]);
    },
  });

  const participants =
    detailQuery.data?.participants.filter((participant) => participant.participantType === "agent") ?? [];
  const messages = messagesQuery.data ?? [];

  return (
    <div className="mt-3 space-y-3 border-t border-border pt-3">
      <p className="text-xs text-muted-foreground">
        Agents only run when invoked explicitly from this room.
      </p>
      {detailQuery.error ? <p className="text-sm text-destructive">{detailQuery.error.message}</p> : null}
      {messagesQuery.error ? <p className="text-sm text-destructive">{messagesQuery.error.message}</p> : null}

      <section className="space-y-2">
        <h3 className="text-xs font-medium uppercase text-muted-foreground">Agent participants</h3>
        {detailQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading participants...</p>
        ) : participants.length === 0 ? (
          <p className="text-sm text-muted-foreground">No agent participants.</p>
        ) : (
          <div className="space-y-2">
            {participants.map((participant) => {
              const invokePending = invokeParticipant.isPending && invokeParticipant.variables === participant.id;
              const invokeAllowed = canInvokeParticipant(detailQuery.data?.room ?? room, participant);
              return (
                <div
                  key={participant.id}
                  className="flex flex-col gap-2 border border-border px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-1 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs">{participant.id}</span>
                      {participant.agentId ? (
                        <span className="text-xs text-muted-foreground">Agent {participant.agentId}</span>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span>Status {participant.status}</span>
                      <span>
                        {participant.lastInvokedRunId
                          ? `Last run ${participant.lastInvokedRunId}`
                          : "Not invoked yet"}
                      </span>
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!invokeAllowed || invokeParticipant.isPending}
                    onClick={() => invokeParticipant.mutate(participant.id)}
                  >
                    <Send className="h-4 w-4" />
                    {invokePending ? "Invoking..." : "Invoke"}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
        {invokeParticipant.error ? (
          <p className="text-sm text-destructive">{invokeParticipant.error.message}</p>
        ) : null}
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-medium uppercase text-muted-foreground">Recent messages</h3>
        {messagesQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading messages...</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">No messages yet.</p>
        ) : (
          <div className="space-y-2">
            {messages.map((message) => (
              <article key={message.id} className="border border-border px-3 py-2">
                <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{messageTypeLabel(message)}</span>
                  {message.sourceRunId ? <span>Run {message.sourceRunId}</span> : null}
                </div>
                <p className="whitespace-pre-wrap text-sm">{messageExcerpt(message.body)}</p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function MeetingRoomRow({ companyId, room }: { companyId: string; room: MeetingRoom }) {
  const chips = contextChips(room);
  const [isOpen, setIsOpen] = useState(false);

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
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs text-muted-foreground">{roomTimestamp(room)}</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-expanded={isOpen}
            onClick={() => setIsOpen((value) => !value)}
          >
            <ChevronDown className={cn("h-4 w-4", isOpen && "rotate-180")} />
            {isOpen ? "Hide details" : "Details"}
          </Button>
        </div>
      </div>
      {isOpen ? <MeetingRoomDetails companyId={companyId} room={room} /> : null}
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
            <MeetingRoomRow key={room.id} companyId={selectedCompanyId} room={room} />
          ))}
        </div>
      )}
    </div>
  );
}
