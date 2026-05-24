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
import { governedChangeApplicationRoutes } from "../routes/governed-change-applications.js";
import { approvalService } from "../services/approvals.js";
import { governedChangeProposalService } from "../services/governed-change-proposals.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres governed change application route tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("governed change application route", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-governed-change-application-route-");
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
    app.use("/api", governedChangeApplicationRoutes(db));
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
      issuePrefix: `GAR${companyId.replace(/-/g, "").slice(0, 4).toUpperCase()}`,
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
  }) {
    return governedChangeProposalService(db).create(
      input.companyId,
      {
        changeType: "roadmap_change",
        title: "Adjust launch roadmap",
        summary: "Move beta after onboarding polish.",
        scope: "project",
        target: { projectId: input.projectId },
        proposedByAgentId: input.agentId,
        proposalPayload: {
          roadmapItems: ["Onboarding polish", "Beta"],
          projectPatch: { description: "Changed by canonical mutation" },
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

  it("returns 200 for an approved matching governed change application without canonical side effects", async () => {
    const { companyId, projectId, agentId } = await seedCompany();
    const proposal = await createProposal({ companyId, projectId, agentId });
    await approvalService(db).approve(proposal.approval.id, "board-user", "approved");
    const app = createApp(companyId);

    const res = await request(app)
      .post(`/api/companies/${companyId}/governed-change-applications`)
      .send({
        issueId: proposal.issue.id,
        changeType: "roadmap_change",
        scope: "project",
        target: { projectId },
      });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({
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
          dryRun: true,
          canonicalSideEffects: false,
        },
      },
    });

    const applicationActivities = await findApplicationActivity(companyId);
    expect(applicationActivities).toHaveLength(1);

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

  it("returns 422 for a pending governed change and records no application activity", async () => {
    const { companyId, projectId, agentId } = await seedCompany();
    const proposal = await createProposal({ companyId, projectId, agentId });
    const app = createApp(companyId);

    const res = await request(app)
      .post(`/api/companies/${companyId}/governed-change-applications`)
      .send({
        issueId: proposal.issue.id,
        changeType: "roadmap_change",
        scope: "project",
        target: { projectId },
      });

    expect(res.status, JSON.stringify(res.body)).toBe(422);
    await expect(findApplicationActivity(companyId)).resolves.toHaveLength(0);
  });

  it("returns 400 for an invalid change type before service application", async () => {
    const { companyId, projectId } = await seedCompany();
    const app = createApp(companyId);

    const res = await request(app)
      .post(`/api/companies/${companyId}/governed-change-applications`)
      .send({
        issueId: randomUUID(),
        changeType: "private_memory_change",
        scope: "project",
        target: { projectId },
      });

    expect(res.status, JSON.stringify(res.body)).toBe(400);
    expect(res.body.error).toBe("Validation error");
    await expect(findApplicationActivity(companyId)).resolves.toHaveLength(0);
  });
});
