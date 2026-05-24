import {
  API,
  type AddMeetingParticipant,
  type CreateMeetingRoom,
  type CreateMeetingSummary,
  type InvokeMeetingParticipant,
  type MeetingMessage,
  type MeetingParticipant,
  type MeetingRoom,
  type MeetingRoomListQuery,
  type MeetingSummary,
  type PostMeetingMessage,
  type UpdateMeetingRoom,
  type UpdateMeetingSummary,
} from "@paperclipai/shared";
import { api } from "./client";

export interface CreateMeetingRoomResult {
  room: MeetingRoom;
  participants: MeetingParticipant[];
}

export interface MeetingRoomDetail {
  room: MeetingRoom;
  participants: MeetingParticipant[];
  latestSummary: Pick<
    MeetingSummary,
    "id" | "companyId" | "roomId" | "summaryKind" | "status" | "title" | "proposalId" | "createdAt" | "updatedAt"
  > | null;
}

export interface ListMeetingMessagesOptions {
  limit?: number | null;
  offset?: number | null;
}

export type MeetingRoomListFilters = {
  [Key in keyof MeetingRoomListQuery]?: MeetingRoomListQuery[Key] | null | "";
};

function withoutApiPrefix(path: string) {
  return path.startsWith("/api") ? path.slice(4) : path;
}

function fillPath(template: string, params: Record<string, string>) {
  let path = withoutApiPrefix(template);
  for (const [key, value] of Object.entries(params)) {
    path = path.replace(`:${key}`, encodeURIComponent(value));
  }
  return path;
}

function appendQuery(path: string, filters?: object | null) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(filters ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }

  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

function roomPath(companyId: string, roomId: string) {
  return fillPath(API.meetingRooms.detail, { companyId, roomId });
}

export const meetingRoomsApi = {
  list: (companyId: string, filters?: MeetingRoomListFilters | null) =>
    api.get<MeetingRoom[]>(
      appendQuery(fillPath(API.meetingRooms.list, { companyId }), filters),
    ),
  create: (companyId: string, data: CreateMeetingRoom) =>
    api.post<CreateMeetingRoomResult>(fillPath(API.meetingRooms.create, { companyId }), data),
  get: (companyId: string, roomId: string) =>
    api.get<MeetingRoomDetail>(roomPath(companyId, roomId)),
  update: (companyId: string, roomId: string, data: UpdateMeetingRoom) =>
    api.patch<MeetingRoom>(fillPath(API.meetingRooms.update, { companyId, roomId }), data),
  addParticipant: (companyId: string, roomId: string, data: AddMeetingParticipant) =>
    api.post<MeetingParticipant>(fillPath(API.meetingRooms.participants, { companyId, roomId }), data),
  removeParticipant: (companyId: string, roomId: string, participantId: string) =>
    api.delete<MeetingParticipant>(fillPath(API.meetingRooms.participant, { companyId, roomId, participantId })),
  invokeParticipant: (
    companyId: string,
    roomId: string,
    participantId: string,
    data: InvokeMeetingParticipant = {},
  ) =>
    api.post<unknown>(
      fillPath(API.meetingRooms.invokeParticipant, { companyId, roomId, participantId }),
      data,
    ),
  listMessages: (companyId: string, roomId: string, options?: ListMeetingMessagesOptions | null) =>
    api.get<MeetingMessage[]>(
      appendQuery(fillPath(API.meetingRooms.messages, { companyId, roomId }), options),
    ),
  postMessage: (companyId: string, roomId: string, data: PostMeetingMessage) =>
    api.post<MeetingMessage>(fillPath(API.meetingRooms.messages, { companyId, roomId }), data),
  createSummary: (companyId: string, roomId: string, data: CreateMeetingSummary) =>
    api.post<MeetingSummary>(fillPath(API.meetingRooms.summaries, { companyId, roomId }), data),
  updateSummary: (companyId: string, roomId: string, summaryId: string, data: UpdateMeetingSummary) =>
    api.patch<MeetingSummary>(fillPath(API.meetingRooms.summary, { companyId, roomId, summaryId }), data),
};
