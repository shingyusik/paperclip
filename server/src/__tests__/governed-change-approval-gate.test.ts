import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  activityLog,
  agents,
  approvals,
  companies,
  createDb,
  issues,
  projects,
} from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { approvalService } from "../services/approvals.js";
import { governedChangeApprovalGateService } from "../services/governed-change-approval-gate.js";
import { governedChangeProposalService } from "../services/governed-change-proposals.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres governed change approval gate tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("governed change approval gate", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-governed-change-approval-gate-");
    db = createDb(tempDb.connectionString);
  }, 20_000);

  afterEach(async () => {
    await db.delete(activityLog);
    await db.delete(approvals);
    await db.delete(issues);
    await db.delete(projects);
    await db.delete(agents);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  async function seedCompany(input: {
    companyId?: string;
    projectId?: string;
    agentId?: string;
    name?: string;
  } = {}) {
    const companyId = input.companyId ?? randomUUID();
    const projectId = input.projectId ?? randomUUID();
    const agentId = input.agentId ?? randomUUID();

    await db.insert(companies).values({
      id: companyId,
      name: input.name ?? "Paperclip",
      issuePrefix: `GCA${companyId.replace(/-/g, "").slice(0, 4).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });
    await db.insert(agents).values({
      id: agentId,
      companyId,
      name: "Planner",
      role: "pm",
      status: "active",
      adapterType: "codex_local",
      adapterConfig: {},
      runtimeConfig: {},
      permissions: {},
    });
    await db.insert(projects).values({
      id: projectId,
      companyId,
      name: "Launch",
      description: "Original project description",
      status: "planned",
    });

    return { companyId, projectId, agentId };
  }

  async function createProposal(input: {
    companyId: string;
    projectId: string;
    agentId: string;
    changeType?: "roadmap_change" | "milestone_task_structure_change" | "shared_project_rule_change";
    scope?: "company" | "project" | "agent" | "issue";
    target?: { projectId?: string; issueId?: string; agentId?: string };
  }) {
    return governedChangeProposalService(db).create(
      input.companyId,
      {
        changeType: input.changeType ?? "roadmap_change",
        title: "Adjust launch roadmap",
        summary: "Move beta after onboarding polish.",
        scope: input.scope ?? "project",
        target: input.target ?? { projectId: input.projectId },
        proposedByAgentId: input.agentId,
        proposalPayload: { roadmapItems: ["Onboarding polish", "Beta"] },
        idempotencyKey: randomUUID(),
      },
      { actorType: "agent", actorId: input.agentId, agentId: input.agentId },
    );
  }

  it("allows an approved matching governed change approval and leaves canonical project state unchanged", async () => {
    const { companyId, projectId, agentId } = await seedCompany();
    const proposal = await createProposal({ companyId, projectId, agentId });

    const approved = await approvalService(db).approve(proposal.approval.id, "board-user", "approved");
    expect(approved.approval.status).toBe("approved");

    const result = await governedChangeApprovalGateService(db).assertApproved(companyId, {
      issueId: proposal.issue.id,
      changeType: "roadmap_change",
      scope: "project",
      target: { projectId },
    });

    expect(result.issue.id).toBe(proposal.issue.id);
    expect(result.approval.id).toBe(proposal.approval.id);
    expect(result.approval.status).toBe("approved");

    const storedProject = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .then((rows) => rows[0]);
    expect(storedProject).toMatchObject({
      name: "Launch",
      description: "Original project description",
      status: "planned",
    });
  });

  it("rejects missing, pending, rejected, and revision requested approvals", async () => {
    const { companyId, projectId, agentId } = await seedCompany();
    const gate = governedChangeApprovalGateService(db);

    const missingApprovalProposal = await createProposal({ companyId, projectId, agentId });
    await db.delete(approvals).where(eq(approvals.id, missingApprovalProposal.approval.id));
    await expect(gate.assertApproved(companyId, {
      issueId: missingApprovalProposal.issue.id,
      changeType: "roadmap_change",
      target: { projectId },
    })).rejects.toMatchObject({ status: 422 });

    const pendingProposal = await createProposal({ companyId, projectId, agentId });
    await expect(gate.assertApproved(companyId, {
      issueId: pendingProposal.issue.id,
      changeType: "roadmap_change",
      target: { projectId },
    })).rejects.toMatchObject({ status: 422 });

    const rejectedProposal = await createProposal({ companyId, projectId, agentId });
    await approvalService(db).reject(rejectedProposal.approval.id, "board-user", "not now");
    await expect(gate.assertApproved(companyId, {
      issueId: rejectedProposal.issue.id,
      changeType: "roadmap_change",
      target: { projectId },
    })).rejects.toMatchObject({ status: 422 });

    const revisionProposal = await createProposal({ companyId, projectId, agentId });
    await approvalService(db).requestRevision(revisionProposal.approval.id, "board-user", "revise");
    await expect(gate.assertApproved(companyId, {
      issueId: revisionProposal.issue.id,
      changeType: "roadmap_change",
      target: { projectId },
    })).rejects.toMatchObject({ status: 422 });
  });

  it("rejects approved approvals with a wrong company, change type, scope, or target", async () => {
    const { companyId, projectId, agentId } = await seedCompany();
    const { companyId: otherCompanyId } = await seedCompany({ name: "Other company" });
    const proposal = await createProposal({ companyId, projectId, agentId });
    await approvalService(db).approve(proposal.approval.id, "board-user", "approved");

    const gate = governedChangeApprovalGateService(db);
    await expect(gate.assertApproved(otherCompanyId, {
      issueId: proposal.issue.id,
      changeType: "roadmap_change",
      scope: "project",
      target: { projectId },
    })).rejects.toMatchObject({ status: 404 });
    await expect(gate.assertApproved(companyId, {
      issueId: proposal.issue.id,
      changeType: "milestone_task_structure_change",
      target: { projectId },
    })).rejects.toMatchObject({ status: 422 });
    await expect(gate.assertApproved(companyId, {
      issueId: proposal.issue.id,
      changeType: "roadmap_change",
      scope: "company",
      target: { projectId },
    })).rejects.toMatchObject({ status: 422 });
    await expect(gate.assertApproved(companyId, {
      issueId: proposal.issue.id,
      changeType: "roadmap_change",
      target: { projectId: randomUUID() },
    })).rejects.toMatchObject({ status: 422 });
  });

  it("rejects normal manual issues even when an approved governed change approval references them", async () => {
    const { companyId, projectId } = await seedCompany();
    const [manualIssue] = await db
      .insert(issues)
      .values({
        companyId,
        projectId,
        title: "Manual issue",
        description: "Not a governed change proposal.",
        status: "backlog",
        priority: "medium",
        originKind: "manual",
      })
      .returning();
    const [approval] = await db
      .insert(approvals)
      .values({
        companyId,
        type: "governed_change",
        status: "approved",
        payload: {
          issueId: manualIssue.id,
          changeType: "roadmap_change",
          target: { projectId },
        },
        decidedByUserId: "board-user",
        decidedAt: new Date(),
      })
      .returning();

    expect(approval.status).toBe("approved");
    await expect(governedChangeApprovalGateService(db).assertApproved(companyId, {
      issueId: manualIssue.id,
      changeType: "roadmap_change",
      target: { projectId },
    })).rejects.toMatchObject({ status: 422 });
  });
});
