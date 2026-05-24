import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
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
import { errorHandler } from "../middleware/index.js";
import { governedChangeProposalRoutes } from "../routes/governed-change-proposals.js";
import { governedChangeProposalService } from "../services/governed-change-proposals.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres governed change proposal tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("governed change proposals", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-governed-change-proposals-");
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

  function createApp(companyId: string) {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).actor = {
        type: "board",
        userId: "board-user",
        companyIds: [companyId],
        memberships: [{ companyId, membershipRole: "owner", status: "active" }],
        source: "session",
        isInstanceAdmin: false,
      };
      next();
    });
    app.use("/api", governedChangeProposalRoutes(db));
    app.use(errorHandler);
    return app;
  }

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
      issuePrefix: `GCP${companyId.replace(/-/g, "").slice(0, 4).toUpperCase()}`,
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

  it("creates an issue-backed pending approval with governed change metadata and no canonical project mutation", async () => {
    const { companyId, projectId, agentId } = await seedCompany();
    const app = createApp(companyId);

    const res = await request(app)
      .post(`/api/companies/${companyId}/governed-change-proposals`)
      .send({
        changeType: "milestone_task_structure_change",
        title: "Split beta milestone",
        summary: "Separate onboarding hardening from beta launch.",
        rationale: "Beta should not block critical setup fixes.",
        target: { projectId },
        proposedByAgentId: agentId,
        proposalPayload: {
          milestones: [
            { title: "Onboarding hardening" },
            { title: "Beta launch" },
          ],
        },
        idempotencyKey: "phase-7.1-milestone-split",
      });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.created).toBe(true);
    expect(res.body.issue).toMatchObject({
      companyId,
      projectId,
      title: "Split beta milestone",
      status: "backlog",
      originKind: "governed_change_proposal",
      originId: "idempotency:phase-7.1-milestone-split",
    });
    expect(res.body.approval).toMatchObject({
      companyId,
      type: "governed_change",
      status: "pending",
      requestedByAgentId: agentId,
      requestedByUserId: null,
      payload: {
        issueId: res.body.issue.id,
        changeType: "milestone_task_structure_change",
        target: { projectId },
        summary: "Separate onboarding hardening from beta launch.",
        rationale: "Beta should not block critical setup fixes.",
        proposalPayload: {
          milestones: [
            { title: "Onboarding hardening" },
            { title: "Beta launch" },
          ],
        },
      },
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

    const activity = await db
      .select()
      .from(activityLog)
      .where(and(eq(activityLog.companyId, companyId), eq(activityLog.entityId, res.body.issue.id)))
      .then((rows) => rows[0] ?? null);
    expect(activity).toMatchObject({
      action: "governed_change_proposal.created",
      entityType: "issue",
    });
  });

  it("reuses an existing open proposal issue and pending approval for the same idempotency key", async () => {
    const { companyId, projectId, agentId } = await seedCompany();
    const svc = governedChangeProposalService(db);
    const input = {
      changeType: "shared_project_rule_change" as const,
      title: "Add smoke-test rule",
      summary: "Require smoke checks before release handoff.",
      scope: "project" as const,
      target: { projectId },
      proposedByAgentId: agentId,
      proposalPayload: { rule: "Run smoke checks" },
      idempotencyKey: "smoke-test-rule",
    };

    const first = await svc.create(companyId, input, { actorType: "agent", actorId: agentId, agentId });
    const second = await svc.create(companyId, input, { actorType: "agent", actorId: agentId, agentId });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.issue.id).toBe(first.issue.id);
    expect(second.approval.id).toBe(first.approval.id);

    const issueCount = await db
      .select()
      .from(issues)
      .where(and(eq(issues.companyId, companyId), eq(issues.originKind, "governed_change_proposal")))
      .then((rows) => rows.length);
    const approvalCount = await db
      .select()
      .from(approvals)
      .where(and(eq(approvals.companyId, companyId), eq(approvals.type, "governed_change")))
      .then((rows) => rows.length);

    expect(issueCount).toBe(1);
    expect(approvalCount).toBe(1);
  });

  it("rejects target ids that belong to another company", async () => {
    const { companyId, agentId } = await seedCompany({ name: "Requester" });
    const { projectId: otherProjectId } = await seedCompany({ name: "Other company" });
    const app = createApp(companyId);

    const res = await request(app)
      .post(`/api/companies/${companyId}/governed-change-proposals`)
      .send({
        changeType: "roadmap_change",
        title: "Change another roadmap",
        summary: "This target is outside the request company.",
        target: { projectId: otherProjectId },
        proposedByAgentId: agentId,
        proposalPayload: { roadmap: ["wrong tenant"] },
      });

    expect(res.status, JSON.stringify(res.body)).toBe(422);
    expect(res.body.error).toContain("Project target does not belong to this company");

    const createdIssues = await db.select().from(issues).where(eq(issues.companyId, companyId));
    expect(createdIssues).toHaveLength(0);
  });
});
