# Hermes Profile Agent Runtime Platform Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Turn Paperclip into a multi-agent operations platform where each Paperclip agent can be bound to an isolated Hermes profile/runtime with private memory, skills, sessions, cron/self-review loops, and workspace state.

**Architecture:** Paperclip remains the organization/control-plane layer. Hermes profiles become one supported agent runtime identity: Paperclip stores runtime binding metadata, invokes Hermes through an adapter/plugin boundary, surfaces safe runtime summaries, and records reflections/improvement proposals as auditable Paperclip objects. Shared organizational changes stay issue-backed and approval-gated; private agent learning stays inside the Hermes profile.

**Tech Stack:** TypeScript, Node/Express, React/Vite, Drizzle/Postgres/PGlite, Paperclip adapter plugin system, Hermes CLI/profile runtime.

---

## Product Decision

Paperclip is not replacing Hermes Agent. Paperclip manages organizations; Hermes executes and learns as the individual agent runtime.

```text
Paperclip = organization / operations / governance control plane
Hermes Agent = per-agent runtime / memory / skills / self-improvement engine
```

A Paperclip agent may be bound to a Hermes profile:

```text
agents row
  └─ runtime_config.hermesProfile
      ├─ profileName
      ├─ hermesHomePath
      ├─ workspacePath
      ├─ memoryPolicy
      ├─ skillPolicy
      ├─ selfImprovementPolicy
      └─ visibilityPolicy
```

## Guardrails

- Paperclip must not directly edit another agent's Hermes memory or skills without an explicit runtime operation and audit trail.
- Shared project rules, roadmap changes, milestone/task changes, and organization-wide templates require issue-backed approval.
- Agent-private learning may update the agent's own Hermes memory/skills, subject to local policy.
- Paperclip exposes summaries and proposals first; raw private runtime files are not the default UI surface.
- The managed roadmap hierarchy remains shallow: Roadmap → Milestone → Task. Lower-level todos stay internal to the runtime.

## Existing Code Anchors

- Agent schema: `packages/db/src/schema/agents.ts`
- Adapter routes/registry: `server/src/routes/adapters.ts`, `server/src/adapters/*`
- Agent routes: `server/src/routes/agents.ts`
- Heartbeat service: `server/src/services/heartbeat.ts`
- Agent UI: `ui/src/pages/AgentDetail.tsx`, `ui/src/pages/Agents.tsx`, `ui/src/pages/NewAgent.tsx`
- Documents/revisions: `packages/db/src/schema/documents.ts`, `packages/db/src/schema/document_revisions.ts`, `packages/db/src/schema/issue_documents.ts`, `server/src/services/documents.ts`
- Project UI: `ui/src/pages/ProjectDetail.tsx`
- Existing planning reference: `doc/GOAL.md`, `doc/PRODUCT.md`, `doc/SPEC-implementation.md`, `doc/spec/agents-runtime.md`

---

## Phase 0: Align Docs and Vocabulary

### Task 0.1: Add product decision to implementation docs

**Objective:** Make the Hermes-profile-agent model a first-class Paperclip product decision.

**Files:**
- Modify: `doc/PRODUCT.md`
- Modify: `doc/SPEC-implementation.md`
- Modify or create: `doc/spec/agents-runtime.md`

**Steps:**
1. Add a concise section named `Hermes Profile Runtime Model`.
2. State that Hermes profile binding is one supported runtime path, not the only Paperclip runtime.
3. Document the split: Paperclip owns organization/governance; Hermes owns private runtime learning/execution.
4. Document guardrails around memory/skill visibility and approval-gated shared changes.
5. Run `pnpm test -- --runInBand` only if doc tooling requires it; otherwise verify Markdown links manually.

**Acceptance Criteria:**
- Docs include the product decision without contradicting existing `control plane, not execution plane` language.
- V1 scope still allows other adapters.

---

## Phase 1: Model Runtime Binding Metadata

### Task 1.1: Add shared Hermes runtime binding types

**Objective:** Define a typed runtime binding payload that can live in `agents.runtime_config`.

**Files:**
- Modify: `packages/shared/src/index.ts` or a focused shared module if present
- Test: `packages/shared/src/adapter-types.test.ts` or new `packages/shared/src/hermes-runtime-binding.test.ts`

**Shape:**

```ts
export const hermesProfileRuntimeBindingSchema = z.object({
  kind: z.literal("hermes_profile"),
  profileName: z.string().min(1).max(128),
  hermesHomePath: z.string().min(1).optional(),
  workspacePath: z.string().min(1).optional(),
  memoryPolicy: z.enum(["private", "summary_visible"]).default("private"),
  skillPolicy: z.enum(["private", "summary_visible", "managed"]).default("private"),
  selfImprovementPolicy: z.enum(["disabled", "proposal_only", "auto_private"]).default("proposal_only"),
  visibilityPolicy: z.enum(["summary_only", "operator_raw_access"]).default("summary_only"),
});
```

**Steps:**
1. Write failing tests for valid/invalid binding payloads.
2. Export inferred TypeScript type.
3. Add helper `readHermesProfileRuntimeBinding(runtimeConfig)` returning `null | binding`.
4. Run targeted shared tests.

**Acceptance Criteria:**
- Invalid profile names and unknown policies are rejected.
- Existing external adapter types remain accepted.

### Task 1.2: Add server-side normalization for agent runtime config

**Objective:** Ensure agent create/update endpoints accept and normalize Hermes binding metadata safely.

**Files:**
- Modify: `server/src/routes/agents.ts`
- Modify: any agent service/helpers used by the route
- Test: existing/new server route test for agents

**Steps:**
1. Find create/update agent validation path.
2. Add normalization of `runtime_config.hermesProfile` through the shared schema.
3. Preserve unknown `runtime_config` keys unless existing policy disallows them.
4. Reject invalid Hermes binding with `422`.
5. Run targeted agent route tests.

**Acceptance Criteria:**
- Agent create/update can store a valid Hermes profile binding.
- Invalid binding returns a clear validation error.
- No migration is required because `runtime_config` already exists as JSONB.

---

## Phase 2: Hermes Adapter Boundary

### Task 2.1: Define adapter config schema for `hermes_profile`

**Objective:** Expose a Hermes runtime adapter boundary that can invoke `hermes --profile <profile> chat --query ...` from an external adapter plugin without registering Hermes profile as a Paperclip server built-in.

**Files:**
- Add: `packages/adapters/hermes-profile/*` as a reusable plugin-facing command/config helper package
- Do not modify: `server/src/adapters/builtin-adapter-types.ts` for Hermes profile runtime binding
- Do not register: `hermes_profile` inside `server/src/adapters/registry.ts` unless a future architecture decision allows built-ins
- Modify shared exports only if a UI/server consumer needs the helper directly

**Recommended Config:**

```ts
type HermesProfileAdapterConfig = {
  profileName: string;
  hermesBin?: string; // default: hermes
  workingDirectory?: string;
  enabledToolsets?: string[];
  model?: string;
};
```

**Steps:**
1. Keep the integration plugin-only unless a future architecture decision changes this.
2. Implement minimal invocation command builder with argument-array output rather than shell-concatenated strings.
3. Do not expose secrets, prompts, or raw profile paths in display/log metadata unless redacted.
4. Add tests for command construction, redaction, config normalization, and plugin-facing schema.

**Acceptance Criteria:**
- The helper can build a Hermes profile heartbeat/task command for an external adapter plugin.
- The implementation follows the current repo's plugin-vs-built-in adapter strategy.
- Profile names and prompts are passed as argv entries, not shell-interpolated strings.

### Task 2.2: Invoke Hermes with Paperclip task context

**Objective:** Generate a task prompt that includes Paperclip context in the right order.

**Files:**
- Modify: `server/src/services/heartbeat.ts` or adapter-specific context builder
- Add: `server/src/services/hermes-profile-context.ts`
- Test: new service tests

**Context Order:**
1. Agent identity, role, reporting line, private memory summary if visible.
2. Company goal / mission.
3. Project roadmap relevant section once project documents exist.
4. Project spec/decisions excerpts once project documents exist.
5. Current milestone/task context.
6. Current issue `plan` document.
7. Meeting-room context if run is part of a discussion.
8. Acceptance criteria.

**Steps:**
1. Extract existing heartbeat context construction points.
2. Add a Hermes-specific prompt builder.
3. Keep long documents summarized/truncated.
4. Add tests for prompt ordering and redaction.

**Acceptance Criteria:**
- Hermes profile heartbeat receives enough context without dumping unrelated full documents.
- Secrets and private paths are redacted in operator-visible logs.

---

## Phase 3: Agent Growth Surfaces

### Task 3.1: Add agent runtime summary endpoint

**Objective:** Expose safe runtime summary metadata for UI tabs without reading private files by default.

**Files:**
- Modify: `server/src/routes/agents.ts`
- Add: service helper such as `server/src/services/agent-runtime-summary.ts`
- Modify shared API types
- Add tests

**Returned Summary:**

```ts
type AgentRuntimeSummary = {
  kind: "hermes_profile" | "none";
  profileName?: string;
  memoryPolicy?: string;
  skillPolicy?: string;
  selfImprovementPolicy?: string;
  lastReflectionAt?: string | null;
  recentSkillChanges?: Array<{ name: string; action: string; at: string }>;
  warnings?: string[];
};
```

**Steps:**
1. Return metadata from Paperclip DB first.
2. Add optional runtime probe later; do not block UI on filesystem reads.
3. Add permission checks and company scoping.

**Acceptance Criteria:**
- Agent detail page can request a summary for the selected company/agent.
- The endpoint does not leak raw private memory by default.

### Task 3.2: Add Agent Detail tabs for Memory, Skills, Reflections, Improvements

**Objective:** Make agent growth visible in the UI.

**Files:**
- Modify: `ui/src/pages/AgentDetail.tsx`
- Modify or add API client under `ui/src/api/agents.ts`
- Test: `ui/src/pages/AgentDetail.test.tsx` if present or focused render test

**Tabs:**
- Overview
- Current Work
- Memory
- Skills
- Meetings
- Reflections
- Improvements
- Settings

**Steps:**
1. Add tab state using existing `PageTabBar`/`Tabs` patterns.
2. Add placeholder panels backed by runtime summary endpoint.
3. Show policies and warnings before exposing raw data.
4. Add tests for tab visibility and empty-state rendering.

**Acceptance Criteria:**
- User can see that an agent has a Hermes runtime identity and growth policies.
- Empty states explain what will appear after tasks/reflections.

---

## Phase 4: Reflection and Self-Improvement Loop

### Task 4.1: Add reflection record model or reuse documents deliberately

**Objective:** Store auditable reflections and improvement proposals in Paperclip without confusing them with private Hermes memory.

**Decision Point:** Choose one:
- A new `agent_reflections` table for structured reflection events.
- Or a document-backed model linked to issue/run/agent.

**Recommended First Pass:** New `agent_reflections` table for queryability.

**Files:**
- Add: `packages/db/src/schema/agent_reflections.ts`
- Modify: `packages/db/src/schema/index.ts`
- Generate migration: `pnpm db:generate`
- Add shared types and validators

**Columns:**
- `id`
- `company_id`
- `agent_id`
- `issue_id` nullable
- `run_id` nullable
- `summary`
- `learned`
- `proposed_memory_updates` jsonb
- `proposed_skill_updates` jsonb
- `shared_change_proposals` jsonb
- `status`: `recorded | proposed | approved | rejected | applied`
- timestamps

**Acceptance Criteria:**
- Reflections are company-scoped and agent-scoped.
- Reflections can link back to issue/run.

### Task 4.2: Trigger reflection after Hermes runs

**Objective:** After a run, optionally ask the Hermes profile to produce a structured reflection.

**Files:**
- Modify: heartbeat/run completion service
- Add: `server/src/services/agent-reflections.ts`
- Test: completion-path tests

**Steps:**
1. Check agent `selfImprovementPolicy`.
2. If disabled, skip.
3. If proposal-only or auto-private, run a bounded reflection prompt after task completion.
4. Store reflection summary and proposed updates in Paperclip.
5. Only apply private Hermes memory/skill updates when policy allows and adapter supports it.

**Acceptance Criteria:**
- Failed reflection does not fail the original task run.
- Reflections are visible and auditable.

---

## Phase 5: Project Documents and Roadmap Context

### Task 5.1: Add `project_documents` using existing document/revision model

**Objective:** Create project-level roadmap/spec/decisions documents using the current document service pattern.

**Files:**
- Add: `packages/db/src/schema/project_documents.ts`
- Modify: `packages/db/src/schema/index.ts`
- Modify: shared document key validators
- Modify: `server/src/services/documents.ts` or extract generic helpers
- Add: routes for project documents
- Generate migration: `pnpm db:generate`

**Keys:**
- `roadmap`
- `spec`
- `decisions`
- `risks`
- `metrics`
- `launch-plan`
- `retrospective`

**Acceptance Criteria:**
- Project documents reuse revisioning, locking, and conflict behavior.
- Unique `(company_id, project_id, key)` constraint exists.

### Task 5.2: Add Project Roadmap tab

**Objective:** Make project roadmap a first-class operating surface.

**Files:**
- Modify: `ui/src/pages/ProjectDetail.tsx`
- Add/modify API client for project documents
- Add tests

**Steps:**
1. Add `Roadmap` tab for `project_documents.key = roadmap`.
2. Add `Documents` tab for all project docs.
3. Use existing Markdown editor/document UI patterns where possible.
4. Add empty-state CTA to create roadmap document.

**Acceptance Criteria:**
- Project has a visible roadmap document.
- Existing issue document UX patterns are reused.

---

## Phase 6: Meeting Rooms

### Task 6.1: Define meeting-room product model

**Objective:** Create first-class meeting rooms for user↔agent and agent↔agent discussions.

**Files:**
- Add schema docs first in `doc/spec/meeting-rooms.md`
- Later DB schema: `meeting_rooms`, `meeting_participants`, `meeting_messages`, `meeting_summaries`

**Minimum Model:**
- `meeting_rooms`: company, optional project/issue/roadmap link, title, status
- `meeting_participants`: user/agent/team participants
- `meeting_messages`: ordered conversation entries
- `meeting_summaries`: durable summary linked to decisions/issues/docs

**Acceptance Criteria:**
- Model supports direct user-created rooms and issue/task-triggered rooms.
- Meeting summaries can feed docs/reflections without directly mutating shared state.

### Task 6.2: Build minimal meeting room UI/API

**Objective:** Allow a user to open a room and invite agents.

**Files:**
- Add server routes
- Add shared types
- Add UI page and nav entry

**Steps:**
1. Create/list/get meeting rooms.
2. Add participants.
3. Post messages.
4. Generate/store summaries.
5. Later: invoke invited agents through their adapter/runtime.

**Acceptance Criteria:**
- User can create a room with one or more agents.
- Conversation is linked to company/project/issue context.

---

## Phase 7: Governance and Approval Flow

### Task 7.1: Convert shared changes into issue-backed proposals

**Objective:** Ensure agent proposals that affect shared org/project state become explicit Paperclip work items.

**Files:**
- Modify: issue creation service
- Add helper: `server/src/services/governed-change-proposals.ts`
- Tests

**Governed Changes:**
- Roadmap changes
- Milestone/task structure changes
- Shared project rules
- Organization-wide skill/template changes
- Agent role/reporting-line changes

**Acceptance Criteria:**
- Proposal creates or links an issue with change type metadata.
- Approval is required before applying canonical changes.

---

## Recommended Implementation Order

1. Phase 0 docs alignment.
2. Phase 1 runtime binding metadata.
3. Phase 2 Hermes adapter boundary and context builder.
4. Phase 3 agent growth UI placeholders.
5. Phase 4 reflection records.
6. Phase 5 project roadmap/documents.
7. Phase 6 meeting rooms.
8. Phase 7 governance proposal automation.

## First PR Scope Recommendation

Keep the first PR small:

- Docs: product decision and runtime model.
- Shared schema: Hermes profile binding in `runtime_config`.
- Server validation: accept/reject binding on agent create/update.
- UI: show Hermes profile binding on Agent Detail settings/overview.
- Tests: shared schema + server validation + minimal UI render.

Do **not** implement full memory/skills reading, meeting rooms, or roadmap documents in the first PR.

## Verification Commands

Use targeted checks during development:

```bash
pnpm --filter @paperclipai/shared test
pnpm --filter server test -- agents
pnpm --filter ui test -- AgentDetail
```

Before PR-ready handoff:

```bash
pnpm -r typecheck
pnpm test:run
pnpm build
```

If `pnpm build` hits known Vite/NTFS hangs in fork-specific environments, use the repo guidance in `AGENTS.md` and report the substituted command explicitly.
