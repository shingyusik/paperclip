import { describe, expect, it, vi } from "vitest";

const mockApi = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("./client", async () => {
  const actual = await vi.importActual<typeof import("./client")>("./client");
  return {
    ...actual,
    api: mockApi,
  };
});

import { agentsApi } from "./agents";

describe("agentsApi runtime summary", () => {
  it("requests the agent runtime summary endpoint with company scope", async () => {
    mockApi.get.mockResolvedValue({ kind: "none", lastReflectionAt: null, recentSkillChanges: [], warnings: [] });

    await agentsApi.runtimeSummary("agent/one", "company 1");

    expect(mockApi.get).toHaveBeenCalledWith(
      "/agents/agent%2Fone/runtime-summary?companyId=company%201",
    );
  });
});
