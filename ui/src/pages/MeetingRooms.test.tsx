// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { MeetingRoom } from "@paperclipai/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MeetingRooms } from "./MeetingRooms";

const mockMeetingRoomsApi = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
}));

const mockNavigate = vi.hoisted(() => vi.fn());
const mockSetBreadcrumbs = vi.hoisted(() => vi.fn());

vi.mock("@/lib/router", () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>{children}</a>
  ),
  useLocation: () => ({ pathname: "/meeting-rooms/open", search: "", hash: "", state: null }),
  useNavigate: () => mockNavigate,
}));

vi.mock("../context/CompanyContext", () => ({
  useCompany: () => ({ selectedCompanyId: "company-1" }),
}));

vi.mock("../context/BreadcrumbContext", () => ({
  useBreadcrumbs: () => ({ setBreadcrumbs: mockSetBreadcrumbs }),
}));

vi.mock("../context/SidebarContext", () => ({
  useSidebar: () => ({ isMobile: false }),
}));

vi.mock("../components/PageTabBar", () => ({
  PageTabBar: ({
    items,
    onValueChange,
  }: {
    items: Array<{ value: string; label: ReactNode }>;
    onValueChange?: (value: string) => void;
  }) => (
    <div>
      {items.map((item) => (
        <button key={item.value} type="button" onClick={() => onValueChange?.(item.value)}>
          {item.label}
        </button>
      ))}
    </div>
  ),
}));

vi.mock("../api/meeting-rooms", () => ({
  meetingRoomsApi: mockMeetingRoomsApi,
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function makeRoom(overrides: Partial<MeetingRoom> = {}): MeetingRoom {
  return {
    id: "room-1",
    companyId: "company-1",
    projectId: null,
    issueId: null,
    projectDocumentId: null,
    title: "Launch sync",
    description: null,
    status: "open",
    originKind: "user_created",
    originId: null,
    createdByUserId: null,
    createdByAgentId: null,
    lastMessageId: null,
    lastMessageAt: null,
    closedAt: null,
    archivedAt: null,
    metadata: null,
    createdAt: new Date("2026-05-01T12:00:00Z"),
    updatedAt: new Date("2026-05-01T12:00:00Z"),
    ...overrides,
  };
}

async function flushReact() {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

function setInputValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

async function renderMeetingRooms(container: HTMLElement, queryClient: QueryClient) {
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <MeetingRooms />
      </QueryClientProvider>,
    );
  });
  await flushReact();
  await flushReact();
  return root;
}

describe("MeetingRooms", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot> | null;
  let queryClient: QueryClient;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = null;
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    mockMeetingRoomsApi.list.mockResolvedValue([
      makeRoom({
        description: "Coordinate launch decisions",
        projectId: "project-1",
        issueId: "issue-1",
        projectDocumentId: "document-1",
        lastMessageAt: new Date("2026-05-02T12:00:00Z"),
      }),
    ]);
    mockMeetingRoomsApi.create.mockResolvedValue({ room: makeRoom(), participants: [] });
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root!.unmount();
      });
    }
    queryClient.clear();
    container.remove();
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("lists open meeting rooms with context and non-execution copy", async () => {
    root = await renderMeetingRooms(container, queryClient);

    expect(mockMeetingRoomsApi.list).toHaveBeenCalledWith("company-1", { status: "open" });
    expect(container.textContent).toContain("Launch sync");
    expect(container.textContent).toContain("Coordinate launch decisions");
    expect(container.textContent).toContain("Project project-1");
    expect(container.textContent).toContain("Issue issue-1");
    expect(container.textContent).toContain("Document document-1");
    expect(container.textContent).toContain("Last message");
    expect(container.textContent).toContain("Meeting rooms coordinate context and do not auto-run agents.");
  });

  it("shows an explicit empty state for open rooms", async () => {
    mockMeetingRoomsApi.list.mockResolvedValue([]);

    root = await renderMeetingRooms(container, queryClient);

    expect(container.textContent).toContain("No open meeting rooms.");
  });

  it("creates a room, refreshes the list, and clears the form", async () => {
    mockMeetingRoomsApi.list
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makeRoom({ title: "Ops sync", description: "Align on launch" })]);

    root = await renderMeetingRooms(container, queryClient);

    const titleInput = container.querySelector<HTMLInputElement>('input[name="title"]');
    const descriptionInput = container.querySelector<HTMLTextAreaElement>('textarea[name="description"]');
    const form = container.querySelector("form");

    expect(titleInput).not.toBeNull();
    expect(descriptionInput).not.toBeNull();
    expect(form).not.toBeNull();

    await act(async () => {
      setInputValue(titleInput!, "Ops sync");
      setInputValue(descriptionInput!, "Align on launch");
      form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await flushReact();
    await flushReact();

    expect(mockMeetingRoomsApi.create).toHaveBeenCalledWith("company-1", {
      title: "Ops sync",
      description: "Align on launch",
    });
    expect(mockMeetingRoomsApi.list).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Ops sync");
    expect(titleInput!.value).toBe("");
  });

  it("routes tab changes through meeting room paths", async () => {
    root = await renderMeetingRooms(container, queryClient);

    const allTab = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "All");
    expect(allTab).not.toBeUndefined();

    await act(async () => {
      allTab!.click();
    });

    expect(mockNavigate).toHaveBeenCalledWith("/meeting-rooms/all");
  });
});
