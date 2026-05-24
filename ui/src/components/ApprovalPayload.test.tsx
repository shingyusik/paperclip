// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ApprovalPayloadRenderer, approvalLabel, typeIcon, typeLabel } from "./ApprovalPayload";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("approvalLabel", () => {
  it("uses payload titles for generic board approvals", () => {
    expect(
      approvalLabel("request_board_approval", {
        title: "Reply with an ASCII frog",
      }),
    ).toBe("Board Approval: Reply with an ASCII frog");
  });

  it("uses governed change summaries as first-class approval labels", () => {
    expect(
      approvalLabel("governed_change", {
        summary: "Rework onboarding roadmap",
      }),
    ).toBe("Governed Change: Rework onboarding roadmap");
  });

  it("exposes first-class governed change type metadata", () => {
    expect(typeLabel.governed_change).toBe("Governed Change");
    expect(typeIcon.governed_change).toBeTruthy();
  });
});

describe("ApprovalPayloadRenderer", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it("renders request_board_approval payload fields without falling back to raw JSON", () => {
    const root = createRoot(container);

    act(() => {
      root.render(
        <ApprovalPayloadRenderer
          type="request_board_approval"
          payload={{
            title: "Reply with an ASCII frog",
            summary: "Board asked for approval before posting the frog.",
            recommendedAction: "Approve the frog reply.",
            nextActionOnApproval: "Post the frog comment on the issue.",
            risks: ["The frog might be too powerful."],
            proposedComment: "(o)<",
          }}
        />,
      );
    });

    expect(container.textContent).toContain("Reply with an ASCII frog");
    expect(container.textContent).toContain("Board asked for approval before posting the frog.");
    expect(container.textContent).toContain("Approve the frog reply.");
    expect(container.textContent).toContain("Post the frog comment on the issue.");
    expect(container.textContent).toContain("The frog might be too powerful.");
    expect(container.textContent).toContain("(o)<");
    expect(container.textContent).not.toContain("\"recommendedAction\"");

    act(() => {
      root.unmount();
    });
  });

  it("can hide the repeated title when the card header already shows it", () => {
    const root = createRoot(container);

    act(() => {
      root.render(
        <ApprovalPayloadRenderer
          type="request_board_approval"
          hidePrimaryTitle
          payload={{
            title: "Reply with an ASCII frog",
            summary: "Board asked for approval before posting the frog.",
          }}
        />,
      );
    });

    expect(container.textContent).toContain("Board asked for approval before posting the frog.");
    expect(container.textContent).not.toContain("TitleReply with an ASCII frog");

    act(() => {
      root.unmount();
    });
  });

  it("renders governed_change payloads with readable proposal fields and bounded JSON", () => {
    const root = createRoot(container);

    act(() => {
      root.render(
        <ApprovalPayloadRenderer
          type="governed_change"
          payload={{
            changeType: "roadmap_change",
            scope: "company",
            target: {
              issueId: "11111111-1111-4111-8111-111111111111",
              projectId: "22222222-2222-4222-8222-222222222222",
            },
            summary: "Rework onboarding roadmap",
            rationale: "The current sequence blocks activation.",
            proposalPayload: {
              roadmapItems: ["Ship guided setup", "Measure activation"],
            },
          }}
        />,
      );
    });

    expect(container.textContent).toContain("Change type");
    expect(container.textContent).toContain("roadmap_change");
    expect(container.textContent).toContain("Scope");
    expect(container.textContent).toContain("company");
    expect(container.textContent).toContain("Issue");
    expect(container.textContent).toContain("11111111-1111-4111-8111-111111111111");
    expect(container.textContent).toContain("Project");
    expect(container.textContent).toContain("22222222-2222-4222-8222-222222222222");
    expect(container.textContent).toContain("Summary");
    expect(container.textContent).toContain("Rework onboarding roadmap");
    expect(container.textContent).toContain("Rationale");
    expect(container.textContent).toContain("The current sequence blocks activation.");

    const proposalJson = container.querySelector("pre code");
    expect(proposalJson?.textContent).toContain('"roadmapItems"');
    expect(proposalJson?.textContent).toContain('"Ship guided setup"');
    expect(proposalJson?.parentElement?.className).toContain("max-h-48");

    act(() => {
      root.unmount();
    });
  });

  it("preserves the generic fallback renderer for unknown approval types", () => {
    const root = createRoot(container);

    act(() => {
      root.render(
        <ApprovalPayloadRenderer
          type="custom_manual_gate"
          payload={{
            customField: "kept visible",
          }}
        />,
      );
    });

    expect(container.textContent).toContain('"customField"');
    expect(container.textContent).toContain('"kept visible"');

    act(() => {
      root.unmount();
    });
  });
});
