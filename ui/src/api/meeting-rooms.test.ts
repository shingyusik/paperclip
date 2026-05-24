import { beforeEach, describe, expect, it, vi } from "vitest";

const mockApi = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("./client", () => ({
  api: mockApi,
}));

import { meetingRoomsApi } from "./meeting-rooms";

describe("meetingRoomsApi", () => {
  beforeEach(() => {
    mockApi.get.mockReset();
    mockApi.post.mockReset();
    mockApi.patch.mockReset();
    mockApi.delete.mockReset();
    mockApi.get.mockResolvedValue([]);
    mockApi.post.mockResolvedValue({});
    mockApi.patch.mockResolvedValue({});
    mockApi.delete.mockResolvedValue({});
  });

  it("lists company meeting rooms with encoded, non-empty query filters", async () => {
    await meetingRoomsApi.list("company 1", {
      status: "open",
      projectId: "",
      issueId: null,
      projectDocumentId: undefined,
      limit: 20,
      offset: 0,
    });

    expect(mockApi.get).toHaveBeenCalledWith(
      "/companies/company%201/meeting-rooms?status=open&limit=20&offset=0",
    );
  });

  it("builds detail, mutation, participant, message, and summary paths", async () => {
    await meetingRoomsApi.create("company-1", { title: "Launch sync" });
    await meetingRoomsApi.get("company-1", "room/1");
    await meetingRoomsApi.update("company-1", "room/1", { status: "closed" });
    await meetingRoomsApi.addParticipant("company-1", "room/1", { participantType: "agent", agentId: "agent-1" });
    await meetingRoomsApi.removeParticipant("company-1", "room/1", "participant/1");
    await meetingRoomsApi.invokeParticipant("company-1", "room/1", "participant/1", {
      reason: "Ask for launch risks",
    });
    await meetingRoomsApi.listMessages("company-1", "room/1", { limit: 10, offset: null });
    await meetingRoomsApi.postMessage("company-1", "room/1", { messageType: "system", body: "Noted." });
    await meetingRoomsApi.createSummary("company-1", "room/1", { summaryKind: "recap", body: "Decision log" });
    await meetingRoomsApi.updateSummary("company-1", "room/1", "summary/1", { status: "accepted" });

    expect(mockApi.post).toHaveBeenNthCalledWith(1, "/companies/company-1/meeting-rooms", { title: "Launch sync" });
    expect(mockApi.get).toHaveBeenNthCalledWith(1, "/companies/company-1/meeting-rooms/room%2F1");
    expect(mockApi.patch).toHaveBeenNthCalledWith(1, "/companies/company-1/meeting-rooms/room%2F1", { status: "closed" });
    expect(mockApi.post).toHaveBeenNthCalledWith(
      2,
      "/companies/company-1/meeting-rooms/room%2F1/participants",
      { participantType: "agent", agentId: "agent-1" },
    );
    expect(mockApi.delete).toHaveBeenCalledWith(
      "/companies/company-1/meeting-rooms/room%2F1/participants/participant%2F1",
    );
    expect(mockApi.post).toHaveBeenNthCalledWith(
      3,
      "/companies/company-1/meeting-rooms/room%2F1/participants/participant%2F1/invoke",
      { reason: "Ask for launch risks" },
    );
    expect(mockApi.get).toHaveBeenNthCalledWith(
      2,
      "/companies/company-1/meeting-rooms/room%2F1/messages?limit=10",
    );
    expect(mockApi.post).toHaveBeenNthCalledWith(
      4,
      "/companies/company-1/meeting-rooms/room%2F1/messages",
      { messageType: "system", body: "Noted." },
    );
    expect(mockApi.post).toHaveBeenNthCalledWith(
      5,
      "/companies/company-1/meeting-rooms/room%2F1/summaries",
      { summaryKind: "recap", body: "Decision log" },
    );
    expect(mockApi.patch).toHaveBeenNthCalledWith(
      2,
      "/companies/company-1/meeting-rooms/room%2F1/summaries/summary%2F1",
      { status: "accepted" },
    );
  });
});
