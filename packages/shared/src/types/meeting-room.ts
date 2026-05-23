import type {
  MeetingMessageType,
  MeetingParticipantRole,
  MeetingParticipantStatus,
  MeetingParticipantType,
  MeetingRoomOriginKind,
  MeetingRoomStatus,
  MeetingSummaryKind,
  MeetingSummaryStatus,
} from "../constants.js";

export interface MeetingRoom {
  id: string;
  companyId: string;
  projectId: string | null;
  issueId: string | null;
  projectDocumentId: string | null;
  title: string;
  description: string | null;
  status: MeetingRoomStatus;
  originKind: MeetingRoomOriginKind;
  originId: string | null;
  createdByUserId: string | null;
  createdByAgentId: string | null;
  lastMessageId: string | null;
  lastMessageAt: Date | null;
  closedAt: Date | null;
  archivedAt: Date | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MeetingParticipant {
  id: string;
  companyId: string;
  roomId: string;
  participantType: MeetingParticipantType;
  userId: string | null;
  agentId: string | null;
  teamId: string | null;
  role: MeetingParticipantRole;
  status: MeetingParticipantStatus;
  invitedByUserId: string | null;
  invitedByAgentId: string | null;
  lastSeenMessageId: string | null;
  lastInvokedRunId: string | null;
  joinedAt: Date | null;
  leftAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MeetingMessage {
  id: string;
  companyId: string;
  roomId: string;
  sequence: number;
  messageType: MeetingMessageType;
  body: string;
  format: string;
  authorUserId: string | null;
  authorAgentId: string | null;
  authorParticipantId: string | null;
  sourceRunId: string | null;
  sourceSummaryId: string | null;
  replyToMessageId: string | null;
  metadata: Record<string, unknown> | null;
  editedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
}

export interface MeetingSummary {
  id: string;
  companyId: string;
  roomId: string;
  summaryKind: MeetingSummaryKind;
  status: MeetingSummaryStatus;
  title: string | null;
  body: string;
  decisions: Record<string, unknown>[] | null;
  actionItems: Record<string, unknown>[] | null;
  openQuestions: Record<string, unknown>[] | null;
  sourceMessageStartId: string | null;
  sourceMessageEndId: string | null;
  generatedByUserId: string | null;
  generatedByAgentId: string | null;
  sourceRunId: string | null;
  linkedIssueId: string | null;
  linkedProjectDocumentId: string | null;
  linkedAgentReflectionId: string | null;
  proposalId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MeetingRoomListQuery {
  status?: MeetingRoomStatus;
  projectId?: string;
  issueId?: string;
  projectDocumentId?: string;
  participantId?: string;
  limit?: number;
  offset?: number;
}

export interface AddMeetingParticipant {
  participantType: MeetingParticipantType;
  userId?: string | null;
  agentId?: string | null;
  teamId?: string | null;
  role?: MeetingParticipantRole;
  status?: MeetingParticipantStatus;
  invitedByUserId?: string | null;
  invitedByAgentId?: string | null;
}

export interface CreateMeetingRoom {
  projectId?: string | null;
  issueId?: string | null;
  projectDocumentId?: string | null;
  title: string;
  description?: string | null;
  status?: MeetingRoomStatus;
  originKind?: MeetingRoomOriginKind;
  originId?: string | null;
  createdByUserId?: string | null;
  createdByAgentId?: string | null;
  participants?: AddMeetingParticipant[];
  metadata?: Record<string, unknown> | null;
}

export interface UpdateMeetingRoom {
  title?: string;
  description?: string | null;
  status?: MeetingRoomStatus;
  metadata?: Record<string, unknown> | null;
}

export interface PostMeetingMessage {
  messageType: MeetingMessageType;
  body: string;
  format?: string;
  authorUserId?: string | null;
  authorAgentId?: string | null;
  authorParticipantId?: string | null;
  sourceRunId?: string | null;
  sourceSummaryId?: string | null;
  replyToMessageId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface CreateMeetingSummary {
  summaryKind: MeetingSummaryKind;
  status?: MeetingSummaryStatus;
  title?: string | null;
  body: string;
  decisions?: Record<string, unknown>[] | null;
  actionItems?: Record<string, unknown>[] | null;
  openQuestions?: Record<string, unknown>[] | null;
  sourceMessageStartId?: string | null;
  sourceMessageEndId?: string | null;
  generatedByUserId?: string | null;
  generatedByAgentId?: string | null;
  sourceRunId?: string | null;
  linkedIssueId?: string | null;
  linkedProjectDocumentId?: string | null;
  linkedAgentReflectionId?: string | null;
  proposalId?: string | null;
}

export interface UpdateMeetingSummary {
  summaryKind?: MeetingSummaryKind;
  status?: MeetingSummaryStatus;
  title?: string | null;
  body?: string;
  decisions?: Record<string, unknown>[] | null;
  actionItems?: Record<string, unknown>[] | null;
  openQuestions?: Record<string, unknown>[] | null;
  linkedIssueId?: string | null;
  linkedProjectDocumentId?: string | null;
  linkedAgentReflectionId?: string | null;
  proposalId?: string | null;
}
