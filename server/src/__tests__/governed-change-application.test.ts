import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
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
import { governedChangeApplicationService } from "../services/governed-change-application.js";
import { governedChangeProposalService } from "../services/governed-change-proposals.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres governed change application tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("governed change application", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-governed-change-application-");
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
      issuePrefix: `GAP${companyId.replace(/-/g, "").slice(0, 4).toUpperCase()}`,
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
    scope?: "company" | "organization" | "project";
    target?: { projectId?: string; issueId?: string; agentId?: string };
    proposalPayload?: Record<string, unknown>;
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
        proposalPayload: input.proposalPayload ?? {
          roadmapItems: ["Onboarding polish", "Beta"],
          projectPatch: {
            name: "Launch v2",
            description: "Changed by canonical mutation",
            status: "in_progress",
            targetDate: "2026-08-15",
            color: "#14b8a6",
            leadAgentId: input.agentId,
          },
        },
        idempotencyKey: randomUUID(),
      },
      { actorType: "agent", actorId: input.agentId, agentId: input.agentId },
    );
  }

  async function findApplicationActivity(companyId: string) {
    return db
      .select()
      .from(activityLog)
      .where(and(
        eq(activityLog.companyId, companyId),
        eq(activityLog.action, "governed_change_application.accepted"),
      ));
  }

  it("rejects a pending proposal and writes no application activity", async () => {
    const { companyId, projectId, agentId } = await seedCompany();
    const proposal = await createProposal({ companyId, projectId, agentId });

    await expect(governedChangeApplicationService(db).acceptApprovedApplication(
      companyId,
      {
        issueId: proposal.issue.id,
        changeType: "roadmap_change",
        scope: "project",
        target: { projectId },
      },
      { actorType: "agent", actorId: agentId, agentId },
    )).rejects.toMatchObject({ status: 422 });

    await expect(findApplicationActivity(companyId)).resolves.toHaveLength(0);
  });

  it("applies an approved roadmap projectPatch and records canonical side effects", async () => {
    const { companyId, projectId, agentId } = await seedCompany();
    const proposal = await createProposal({ companyId, projectId, agentId });
    await approvalService(db).approve(proposal.approval.id, "board-user", "approved");

    const result = await governedChangeApplicationService(db).acceptApprovedApplication(
      companyId,
      {
        issueId: proposal.issue.id,
        changeType: "roadmap_change",
        scope: "project",
        target: { projectId },
      },
      { actorType: "agent", actorId: agentId, agentId, runId: null },
    );

    expect(result).toMatchObject({
      canonicalSideEffects: true,
      issue: { id: proposal.issue.id },
      approval: { id: proposal.approval.id, status: "approved" },
    });
    expect(result.activity).toMatchObject({
      action: "governed_change_application.accepted",
      entityType: "issue",
      entityId: proposal.issue.id,
      details: {
        approvalId: proposal.approval.id,
        issueId: proposal.issue.id,
        changeType: "roadmap_change",
        scope: "project",
        target: { projectId },
        dryRun: false,
        canonicalSideEffects: true,
        appliedProjectPatch: {
          name: "Launch v2",
          description: "Changed by canonical mutation",
          status: "in_progress",
          targetDate: "2026-08-15",
          color: "#14b8a6",
        },
      },
    });

    const applicationActivities = await findApplicationActivity(companyId);
    expect(applicationActivities).toHaveLength(1);
    expect(applicationActivities[0].details).toMatchObject({
      approvalId: proposal.approval.id,
      issueId: proposal.issue.id,
      changeType: "roadmap_change",
      scope: "project",
      target: { projectId },
      dryRun: false,
      canonicalSideEffects: true,
      appliedProjectPatch: {
        name: "Launch v2",
        description: "Changed by canonical mutation",
        status: "in_progress",
        targetDate: "2026-08-15",
        color: "#14b8a6",
      },
    });

    const storedProject = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .then((rows) => rows[0]);
    expect(storedProject).toMatchObject({
      name: "Launch v2",
      description: "Changed by canonical mutation",
      status: "in_progress",
      targetDate: "2026-08-15",
      color: "#14b8a6",
      leadAgentId: null,
    });
  });

  it("does not reapply an already accepted canonical projectPatch", async () => {
    const { companyId, projectId, agentId } = await seedCompany();
    const proposal = await createProposal({ companyId, projectId, agentId });
    await approvalService(db).approve(proposal.approval.id, "board-user", "approved");
    const service = governedChangeApplicationService(db);
    const applicationInput = {
      issueId: proposal.issue.id,
      changeType: "roadmap_change" as const,
      scope: "project" as const,
      target: { projectId },
    };

    const firstResult = await service.acceptApprovedApplication(
      companyId,
      applicationInput,
      { actorType: "agent", actorId: agentId, agentId, runId: null },
    );
    expect(firstResult.canonicalSideEffects).toBe(true);

    await db
      .update(projects)
      .set({
        name: "Manual operator edit",
        description: "Changed after first canonical application",
        status: "planned",
        targetDate: "2026-09-30",
        color: "#f59e0b",
      })
      .where(eq(projects.id, projectId));

    const secondResult = await service.acceptApprovedApplication(
      companyId,
      applicationInput,
      { actorType: "agent", actorId: agentId, agentId, runId: null },
    );

    expect(secondResult).toMatchObject({
      canonicalSideEffects: false,
      issue: { id: proposal.issue.id },
      approval: { id: proposal.approval.id, status: "approved" },
      activity: {
        action: "governed_change_application.accepted",
        entityType: "issue",
        entityId: proposal.issue.id,
        details: {
          approvalId: proposal.approval.id,
          issueId: proposal.issue.id,
          changeType: "roadmap_change",
          scope: "project",
          target: { projectId },
          alreadyApplied: true,
          previousActivityId: firstResult.activity.id,
          dryRun: true,
          canonicalSideEffects: false,
        },
      },
    });
    expect(secondResult.activity.details).not.toHaveProperty("appliedProjectPatch");

    const applicationActivities = await findApplicationActivity(companyId);
    expect(applicationActivities).toHaveLength(2);
    const duplicateActivity = applicationActivities.find((activity) => {
      return activity.details?.alreadyApplied === true;
    });
    expect(duplicateActivity?.details).toMatchObject({
      alreadyApplied: true,
      previousActivityId: firstResult.activity.id,
      dryRun: true,
      canonicalSideEffects: false,
    });

    const storedProject = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .then((rows) => rows[0]);
    expect(storedProject).toMatchObject({
      name: "Manual operator edit",
      description: "Changed after first canonical application",
      status: "planned",
      targetDate: "2026-09-30",
      color: "#f59e0b",
    });
  });

  it("keeps an approved governed change without supported projectPatch as no-side-effect", async () => {
    const { companyId, projectId, agentId } = await seedCompany();
    const proposal = await createProposal({
      companyId,
      projectId,
      agentId,
      proposalPayload: {
        roadmapItems: ["Onboarding polish", "Beta"],
      },
    });
    await approvalService(db).approve(proposal.approval.id, "board-user", "approved");

    const result = await governedChangeApplicationService(db).acceptApprovedApplication(
      companyId,
      {
        issueId: proposal.issue.id,
        changeType: "roadmap_change",
        scope: "project",
        target: { projectId },
      },
      { actorType: "agent", actorId: agentId, agentId, runId: null },
    );

    expect(result).toMatchObject({
      canonicalSideEffects: false,
      issue: { id: proposal.issue.id },
      approval: { id: proposal.approval.id, status: "approved" },
    });

    const applicationActivities = await findApplicationActivity(companyId);
    expect(applicationActivities).toHaveLength(1);
    expect(applicationActivities[0].details).toMatchObject({
      approvalId: proposal.approval.id,
      issueId: proposal.issue.id,
      changeType: "roadmap_change",
      scope: "project",
      target: { projectId },
      dryRun: true,
      canonicalSideEffects: false,
    });

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

  it("rejects approved proposals with wrong target, change type, or scope and writes no application activity", async () => {
    const { companyId, projectId, agentId } = await seedCompany();
    const proposal = await createProposal({ companyId, projectId, agentId });
    await approvalService(db).approve(proposal.approval.id, "board-user", "approved");
    const service = governedChangeApplicationService(db);

    await expect(service.acceptApprovedApplication(
      companyId,
      {
        issueId: proposal.issue.id,
        changeType: "roadmap_change",
        scope: "project",
        target: { projectId: randomUUID() },
      },
      { actorType: "agent", actorId: agentId, agentId },
    )).rejects.toMatchObject({ status: 422 });
    await expect(service.acceptApprovedApplication(
      companyId,
      {
        issueId: proposal.issue.id,
        changeType: "milestone_task_structure_change",
        scope: "project",
        target: { projectId },
      },
      { actorType: "agent", actorId: agentId, agentId },
    )).rejects.toMatchObject({ status: 422 });
    await expect(service.acceptApprovedApplication(
      companyId,
      {
        issueId: proposal.issue.id,
        changeType: "roadmap_change",
        scope: "company",
        target: { projectId },
      },
      { actorType: "agent", actorId: agentId, agentId },
    )).rejects.toMatchObject({ status: 422 });

    await expect(findApplicationActivity(companyId)).resolves.toHaveLength(0);
  });
});
