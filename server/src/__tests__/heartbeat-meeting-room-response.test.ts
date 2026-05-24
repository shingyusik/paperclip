import { beforeEach, describe, expect, it, vi } from "vitest";

const meetingRoomMocks = vi.hoisted(() => ({
  recordAgentRunResponseMessage: vi.fn(),
}));

vi.mock("../services/meeting-rooms.js", () => ({
  meetingRoomService: () => ({
    recordAgentRunResponseMessage: meetingRoomMocks.recordAgentRunResponseMessage,
  }),
}));

import { recordMeetingRoomAgentResponseForRun } from "../services/heartbeat.ts";

describe("heartbeat meeting room response hook", () => {
  beforeEach(() => {
    meetingRoomMocks.recordAgentRunResponseMessage.mockReset();
  });

  it("records meeting room responses through the meeting-room service helper", async () => {
    const db = {} as any;
    const run = { id: "run-1", companyId: "company-1", agentId: "agent-1" } as any;
    const onLog = vi.fn();

    await recordMeetingRoomAgentResponseForRun({ db, run, onLog });

    expect(meetingRoomMocks.recordAgentRunResponseMessage).toHaveBeenCalledWith(run);
    expect(onLog).not.toHaveBeenCalled();
  });

  it("logs helper failures without throwing from run finalization", async () => {
    const db = {} as any;
    const run = { id: "run-1", companyId: "company-1", agentId: "agent-1" } as any;
    const onLog = vi.fn();
    meetingRoomMocks.recordAgentRunResponseMessage.mockRejectedValueOnce(new Error("write failed"));

    await expect(recordMeetingRoomAgentResponseForRun({ db, run, onLog })).resolves.toBeUndefined();

    expect(onLog).toHaveBeenCalledWith(
      "stderr",
      "[paperclip] Failed to record meeting room agent response: write failed\n",
    );
  });
});
