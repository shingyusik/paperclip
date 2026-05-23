import { describe, expect, it } from "vitest";
import { API } from "./api.js";

describe("API meeting room constants", () => {
  it("matches the meeting-room API paths from the spec", () => {
    expect(API.meetingRooms).toEqual({
      list: "/api/companies/:companyId/meeting-rooms",
      create: "/api/companies/:companyId/meeting-rooms",
      detail: "/api/companies/:companyId/meeting-rooms/:roomId",
      update: "/api/companies/:companyId/meeting-rooms/:roomId",
      participants: "/api/companies/:companyId/meeting-rooms/:roomId/participants",
      participant: "/api/companies/:companyId/meeting-rooms/:roomId/participants/:participantId",
      messages: "/api/companies/:companyId/meeting-rooms/:roomId/messages",
      summaries: "/api/companies/:companyId/meeting-rooms/:roomId/summaries",
      summary: "/api/companies/:companyId/meeting-rooms/:roomId/summaries/:summaryId",
      issueMeetingRooms: "/api/companies/:companyId/issues/:issueId/meeting-rooms",
      projectDocumentMeetingRooms:
        "/api/companies/:companyId/projects/:projectId/documents/:documentId/meeting-rooms",
    });
  });
});
