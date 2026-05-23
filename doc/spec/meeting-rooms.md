# Meeting Rooms Product Model

Status: Design target for Phase 6.1
Date: 2026-05-24
Audience: Product, engineering, and agent-runtime authors
Scope: Product and schema-design contract only. Do not implement DB schema, routes, shared runtime types, UI, migrations, or executable code from this document until Phase 6.2 or later.

## 1. Document Role

This document defines the target product model for first-class meeting rooms in Paperclip.

- `doc/SPEC-implementation.md` remains the V1 implementation contract.
- `doc/spec/agents-runtime.md` defines how agents are invoked through heartbeats and adapters.
- `doc/TASKS.md` defines issues as the core work entity.
- This document adds the meeting-room model that later phases can translate into schema, API, and UI.

Meeting rooms are a communication and coordination surface attached to company work. They complement issues, comments, project documents, roadmaps, and agent reflections; they do not replace any of those canonical records.

## 2. Product Goals

1. Let a board user create an ad-hoc room and invite one or more agents.
2. Let Paperclip create a room from work context, such as an issue, task, project, roadmap discussion, or future approval/proposal flow.
3. Keep every room company-scoped and optionally linked to a project, issue, project document, or roadmap document.
4. Represent user, agent, and team participants without implying that agents run automatically when they are invited.
5. Store ordered conversation entries with durable authorship, timestamps, and auditability.
6. Store durable summaries that can feed project documents, issue plans, decisions, and agent reflections through explicit proposal or approval flows.
7. Preserve the control-plane boundary: meetings can produce proposals and context, but they cannot directly mutate shared canonical state.

## 3. Non-Goals

1. Do not build a general-purpose chat app detached from Paperclip work objects.
2. Do not create multi-assignee issue semantics. Issues keep the single-assignee model.
3. Do not auto-run agents merely because they are meeting participants.
4. Do not let summaries directly edit project documents, issue descriptions, roadmaps, org structure, skills, or shared rules.
5. Do not define realtime transport, streaming protocol, or adapter invocation implementation in Phase 6.1.
6. Do not define enterprise-grade room-level RBAC beyond company access and basic participant visibility rules.

## 4. Core Concepts

### 4.1 Meeting Room

A meeting room is a company-scoped conversation container. It can be created directly by a user or by Paperclip from an issue/task/project context.

Rooms may be linked to:

- a company only
- a project
- an issue
- a project document, including a roadmap document
- a future governed change proposal

The link is context, not ownership transfer. A room linked to an issue does not change the issue assignee, issue status, or checkout lock.

### 4.2 Participant

A participant is a room membership record for one actor target:

- `user`: a human board/operator account
- `agent`: a Paperclip agent
- `team`: a group of agents represented as a participant target for discovery and context

An agent participant means the room can include that agent in context and can later request an explicit invocation. It does not mean the agent is continuously present, listening, or automatically running.

### 4.3 Message

A message is an ordered entry in a room transcript. Messages can be authored by users, agents, or the system. System messages record lifecycle and governance events, such as room creation, participant changes, summary generation, proposal creation, or approval decisions.

### 4.4 Summary

A summary is a durable, queryable artifact derived from a room. It may capture decisions, open questions, action items, links to issues/documents, and proposed changes. Summaries are inputs to governance and documentation flows; they are not direct writes to canonical shared state.

## 5. Lifecycle and Statuses

### 5.1 Room Status

`meeting_rooms.status` should use a small enum:

| Status | Meaning |
|---|---|
| `open` | Active room. Users may post messages, add participants, and request summaries. |
| `paused` | Temporarily closed for new messages or agent invocation, usually due to budget, moderation, or operator pause. |
| `closed` | Conversation is complete. Readable and summarizable, but normal posting is disabled. |
| `archived` | Hidden from default lists. Readable through history/audit surfaces. |

Status rules:

- New user-created rooms default to `open`.
- New issue/task-triggered rooms default to `open`.
- `closed` and `archived` rooms must retain messages and summaries.
- Reopening a `closed` room is allowed if the user has company access.
- Reopening an `archived` room should be explicit and logged.

### 5.2 Participant Status

`meeting_participants.status` should use:

| Status | Meaning |
|---|---|
| `invited` | Participant was added but has not contributed or been explicitly invoked. |
| `active` | Participant is available in room context or has contributed. |
| `left` | Participant was removed or left the room. |
| `disabled` | Participant can no longer act, usually because the agent/user/team was paused, revoked, or archived. |

Agent participants can remain `invited` forever. That state is valid and must not trigger a heartbeat by itself.

### 5.3 Summary Status

`meeting_summaries.status` should use:

| Status | Meaning |
|---|---|
| `draft` | Generated or manually written, not yet accepted as the durable room summary. |
| `accepted` | Operator accepted it as the current durable summary for the room or time window. |
| `superseded` | Replaced by a newer summary. |
| `proposed` | Attached to a proposal flow that may update docs, issues, decisions, or reflections. |
| `applied` | The linked proposal was approved and applied elsewhere. |
| `rejected` | The linked proposal was rejected. |

Only explicit proposal/approval flows can move a summary-derived change into shared canonical state.

## 6. Entity Model

All tables are future target schema. This phase creates documentation only.

### 6.1 `meeting_rooms`

Purpose: One company-scoped conversation container.

Fields:

| Field | Type | Required | Notes |
|---|---|---:|---|
| `id` | uuid | yes | Primary key. |
| `company_id` | uuid FK `companies.id` | yes | Every room belongs to exactly one company. |
| `project_id` | uuid FK `projects.id` | no | Optional project context. Must match `company_id`. |
| `issue_id` | uuid FK `issues.id` | no | Optional issue/task context. Must match `company_id`; if `project_id` is also set, it must match the issue project when present. |
| `project_document_id` | uuid FK `project_documents.id` | no | Optional project document context. Useful for roadmap/spec/decisions discussions. Must match `company_id` and `project_id` when present. |
| `title` | text | yes | Human-readable title. |
| `description` | text | no | Optional room brief or agenda. Markdown allowed. |
| `status` | enum | yes | `open`, `paused`, `closed`, `archived`. |
| `origin_kind` | enum | yes | `user_created`, `issue_triggered`, `project_triggered`, `document_triggered`, `system_triggered`. |
| `origin_id` | text/uuid | no | Stable origin reference when applicable. |
| `created_by_user_id` | text FK `users.id` | no | User creator, if human-created. |
| `created_by_agent_id` | uuid FK `agents.id` | no | Agent creator, if agent/system-created through an audited flow. |
| `last_message_id` | uuid FK `meeting_messages.id` | no | Cached pointer for list views. |
| `last_message_at` | timestamptz | no | Cached timestamp for ordering. |
| `closed_at` | timestamptz | no | Set when status becomes `closed`. |
| `archived_at` | timestamptz | no | Set when status becomes `archived`. |
| `metadata` | jsonb | no | Future extension point. Must not store secrets. |
| `created_at` | timestamptz | yes | Standard timestamp. |
| `updated_at` | timestamptz | yes | Standard timestamp. |

Invariants:

- `company_id` is required and controls access.
- Linked project, issue, and document must belong to the same company.
- A room may have zero or one of each optional context link.
- `created_by_user_id` and `created_by_agent_id` may both be null only for trusted system-created rooms with an activity entry.
- Deleting a linked issue/project/document must not delete room history; use nullable foreign keys with preserved audit metadata or restricted deletes according to existing project conventions.

### 6.2 `meeting_participants`

Purpose: Room membership and actor targeting.

Fields:

| Field | Type | Required | Notes |
|---|---|---:|---|
| `id` | uuid | yes | Primary key. |
| `company_id` | uuid FK `companies.id` | yes | Denormalized for company access and indexing. |
| `room_id` | uuid FK `meeting_rooms.id` | yes | Parent room. |
| `participant_type` | enum | yes | `user`, `agent`, `team`. |
| `user_id` | text FK `users.id` | no | Required when `participant_type = user`. |
| `agent_id` | uuid FK `agents.id` | no | Required when `participant_type = agent`. |
| `team_id` | uuid FK teams table | no | Required when `participant_type = team` once teams are canonical. Until then, store only when a real team model exists. |
| `role` | enum | yes | `host`, `member`, `observer`. |
| `status` | enum | yes | `invited`, `active`, `left`, `disabled`. |
| `invited_by_user_id` | text FK `users.id` | no | Human inviter. |
| `invited_by_agent_id` | uuid FK `agents.id` | no | Agent inviter through audited flow. |
| `last_seen_message_id` | uuid FK `meeting_messages.id` | no | Read tracking for future UI. |
| `last_invoked_run_id` | uuid FK `heartbeat_runs.id` | no | Last explicit room-driven agent invocation. |
| `joined_at` | timestamptz | no | Set when participant becomes active. |
| `left_at` | timestamptz | no | Set when participant leaves or is removed. |
| `created_at` | timestamptz | yes | Standard timestamp. |
| `updated_at` | timestamptz | yes | Standard timestamp. |

Invariants:

- Exactly one target column must be set according to `participant_type`.
- Participant targets must belong to the same company when the target is company-scoped.
- A room should not have duplicate active participants for the same `(room_id, participant_type, target_id)`.
- A team participant represents a target group for context and future invitation expansion. It does not imply that every team member is individually present or invoked.

### 6.3 `meeting_messages`

Purpose: Ordered conversation entries.

Fields:

| Field | Type | Required | Notes |
|---|---|---:|---|
| `id` | uuid | yes | Primary key. |
| `company_id` | uuid FK `companies.id` | yes | Denormalized for company access and indexing. |
| `room_id` | uuid FK `meeting_rooms.id` | yes | Parent room. |
| `sequence` | bigint/int | yes | Monotonic room-local order. |
| `message_type` | enum | yes | `user`, `agent`, `system`, `summary`, `proposal`. |
| `body` | text | yes | Markdown body. |
| `format` | text | yes | Default `markdown`; reserve for future structured content. |
| `author_user_id` | text FK `users.id` | no | Required for user messages. |
| `author_agent_id` | uuid FK `agents.id` | no | Required for agent messages. |
| `author_participant_id` | uuid FK `meeting_participants.id` | no | Optional membership pointer. |
| `source_run_id` | uuid FK `heartbeat_runs.id` | no | Agent run that produced this message, when applicable. |
| `source_summary_id` | uuid FK `meeting_summaries.id` | no | Summary that produced this transcript entry, when applicable. |
| `reply_to_message_id` | uuid FK `meeting_messages.id` | no | Optional thread/reply pointer. |
| `metadata` | jsonb | no | Attachments, citations, token/cost metadata, redaction flags, or future structured payloads. Must not store secrets. |
| `edited_at` | timestamptz | no | Future edit support. |
| `deleted_at` | timestamptz | no | Soft delete/tombstone support. |
| `created_at` | timestamptz | yes | Message timestamp and ordering fallback. |

Invariants:

- `sequence` must be unique per room and assigned atomically.
- User messages require `author_user_id`; agent messages require `author_agent_id`; system messages may have neither.
- Messages must not bypass activity/audit logging for mutating system events.
- Soft-deleted messages retain author, sequence, and audit metadata.

### 6.4 `meeting_summaries`

Purpose: Durable summaries and proposal inputs derived from a room.

Fields:

| Field | Type | Required | Notes |
|---|---|---:|---|
| `id` | uuid | yes | Primary key. |
| `company_id` | uuid FK `companies.id` | yes | Denormalized for company access and indexing. |
| `room_id` | uuid FK `meeting_rooms.id` | yes | Parent room. |
| `summary_kind` | enum | yes | `rolling`, `final`, `decision`, `proposal`, `reflection_input`. |
| `status` | enum | yes | `draft`, `accepted`, `superseded`, `proposed`, `applied`, `rejected`. |
| `title` | text | no | Optional short label. |
| `body` | text | yes | Markdown summary. |
| `decisions` | jsonb | no | Structured decisions, if extracted. |
| `action_items` | jsonb | no | Structured action items, if extracted. |
| `open_questions` | jsonb | no | Structured unresolved questions. |
| `source_message_start_id` | uuid FK `meeting_messages.id` | no | First source message included. |
| `source_message_end_id` | uuid FK `meeting_messages.id` | no | Last source message included. |
| `generated_by_user_id` | text FK `users.id` | no | User who manually wrote or requested summary. |
| `generated_by_agent_id` | uuid FK `agents.id` | no | Agent that generated summary, if applicable. |
| `source_run_id` | uuid FK `heartbeat_runs.id` | no | Run that generated summary, if applicable. |
| `linked_issue_id` | uuid FK `issues.id` | no | Issue that should receive or review the summary context. |
| `linked_project_document_id` | uuid FK `project_documents.id` | no | Project document that the summary may propose updating. |
| `linked_agent_reflection_id` | uuid FK `agent_reflections.id` | no | Reflection record created from this summary, if applicable. |
| `proposal_id` | uuid FK governed proposals table | no | Future approval/proposal flow reference. |
| `created_at` | timestamptz | yes | Standard timestamp. |
| `updated_at` | timestamptz | yes | Standard timestamp. |

Invariants:

- Summary links must stay within the same company.
- `accepted` summaries should supersede older accepted summaries for the same `(room_id, summary_kind)` when appropriate.
- `applied` requires a linked approval/proposal record or an equivalent audited operation.
- Summaries can propose edits to project documents, issue plans/descriptions, decisions docs, or agent reflections, but they cannot apply those edits directly.

## 7. Relationships

```text
companies
  -> meeting_rooms
       -> meeting_participants
       -> meeting_messages
       -> meeting_summaries

projects
  -> meeting_rooms

issues
  -> meeting_rooms
  -> meeting_summaries

project_documents
  -> meeting_rooms
  -> meeting_summaries

agents
  -> meeting_participants
  -> meeting_messages
  -> meeting_summaries

heartbeat_runs
  -> meeting_messages
  -> meeting_summaries
```

Meeting rooms reference work context. Work context does not depend on meeting rooms for core lifecycle.

## 8. Indexes and Constraints

Recommended future indexes:

- `meeting_rooms(company_id, status, last_message_at desc)`
- `meeting_rooms(company_id, project_id, status)`
- `meeting_rooms(company_id, issue_id, status)`
- `meeting_rooms(company_id, project_document_id, status)`
- `meeting_rooms(company_id, origin_kind, origin_id)`
- `meeting_participants(company_id, room_id)`
- unique active participant target per room:
  - `(room_id, participant_type, user_id)` where `participant_type = 'user'` and `status in ('invited', 'active')`
  - `(room_id, participant_type, agent_id)` where `participant_type = 'agent'` and `status in ('invited', 'active')`
  - `(room_id, participant_type, team_id)` where `participant_type = 'team'` and `status in ('invited', 'active')`
- `meeting_participants(company_id, agent_id, status)` for agent meeting tabs
- `meeting_messages(room_id, sequence)` unique
- `meeting_messages(company_id, room_id, created_at)`
- `meeting_messages(company_id, author_agent_id, created_at desc)`
- `meeting_summaries(company_id, room_id, status, created_at desc)`
- `meeting_summaries(company_id, linked_issue_id)`
- `meeting_summaries(company_id, linked_project_document_id)`

Recommended constraints:

- Check exactly one participant target is set for each participant row.
- Check author fields match `meeting_messages.message_type`.
- Check linked entities share `company_id`.
- Check room `closed_at` and `archived_at` align with status transitions.
- Check message `sequence > 0`.

## 9. Later API Shape for Phase 6.2

All endpoints should live under `/api` and enforce company access.

Candidate endpoints:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/companies/:companyId/meeting-rooms` | List rooms, filter by status/project/issue/document/participant. |
| `POST` | `/api/companies/:companyId/meeting-rooms` | Create user-created room with optional context and initial participants. |
| `GET` | `/api/companies/:companyId/meeting-rooms/:roomId` | Get room details, participants, latest summary metadata. |
| `PATCH` | `/api/companies/:companyId/meeting-rooms/:roomId` | Update title, description, status, archive/close/reopen. |
| `POST` | `/api/companies/:companyId/meeting-rooms/:roomId/participants` | Add user, agent, or team participants. |
| `DELETE` | `/api/companies/:companyId/meeting-rooms/:roomId/participants/:participantId` | Mark participant as left/removed. |
| `GET` | `/api/companies/:companyId/meeting-rooms/:roomId/messages` | Paginated ordered transcript. |
| `POST` | `/api/companies/:companyId/meeting-rooms/:roomId/messages` | Post a user/system message. Agent messages require explicit runtime pathway. |
| `POST` | `/api/companies/:companyId/meeting-rooms/:roomId/summaries` | Generate or create summary draft. |
| `PATCH` | `/api/companies/:companyId/meeting-rooms/:roomId/summaries/:summaryId` | Accept, supersede, reject, or link summary to a proposal. |
| `POST` | `/api/companies/:companyId/issues/:issueId/meeting-rooms` | Create an issue/task-triggered room from work context. |
| `POST` | `/api/companies/:companyId/projects/:projectId/documents/:documentId/meeting-rooms` | Create a room linked to a project document or roadmap. |

API rules:

- Mutations must write activity log entries.
- Errors should follow existing HTTP conventions: `400`, `401`, `403`, `404`, `409`, `422`, `500`.
- Create endpoints must validate company-scoped links before inserting.
- Posting a message to a `closed`, `paused`, or `archived` room should return `409` unless the message is an allowed system/audit event.
- Agent invocation is not implied by participant creation or normal message posting.

## 10. UI Expectations

Phase 6.2 should start with a minimal board UI:

1. Meeting room list scoped to the selected company.
2. Create-room flow with title, optional project/issue/document link, and agent invitations.
3. Room detail view with participants, ordered messages, composer, and summary panel.
4. Entry points from:
   - company work navigation or search
   - project detail
   - issue detail
   - project roadmap/document tab
   - agent detail meeting tab
5. Empty states that make the work context clear without presenting meetings as general chat.
6. Visible indicators when an agent is invited but has not been explicitly invoked.
7. Summary actions that clearly distinguish "copy/propose to document" from "applied to document".

UI copy should preserve Paperclip language:

- "Create room" for ad-hoc coordination.
- "Start discussion from issue" for task-triggered rooms.
- "Invite agent" for membership.
- "Ask agent to respond" or "invoke" for explicit runtime execution.
- "Propose document update" for summary-driven changes.

## 11. Agent Invocation Boundary

Meeting participation and agent execution are separate.

Rules:

1. Adding an agent participant does not wake the agent.
2. Posting a user message does not wake every invited agent.
3. Agent-to-agent rooms may exist as records before any runtime support exists.
4. A future explicit action such as "Ask selected agents" may create heartbeat wakeups with room context.
5. Room-driven wakeups must use the normal adapter/heartbeat boundary from `doc/spec/agents-runtime.md`.
6. Agent responses must be stored as `meeting_messages` linked to `source_run_id`.
7. Runtime prompts may include room context, but should include only the relevant transcript window and accepted summaries.
8. Private Hermes memory, skills, and raw runtime files remain subject to runtime visibility policy. Meeting rooms do not grant raw private access.

Agent-to-agent representation:

- A room may have only agent participants.
- Those agents are targets and authors, not live sockets.
- Future orchestration can explicitly invoke one or more agents in sequence or by approval-gated automation.
- Until that exists, the model still supports storing planned discussions, summaries, and transcript entries produced by explicit agent runs.

## 12. Summary and Governance Rules

Summaries are durable artifacts and proposal inputs.

Allowed summary outputs:

- A concise room recap.
- Decisions and rationale.
- Open questions.
- Action items that can become issues.
- Proposed edits to project roadmap/spec/decisions documents.
- Proposed issue description/plan updates.
- Reflection input for one or more agents.

Disallowed direct effects:

- Directly editing project documents or roadmap documents.
- Directly changing issue title, description, status, assignee, priority, or parentage.
- Directly changing agent role, reporting line, runtime config, memory policy, or skills.
- Directly applying shared organization rules or templates.

Governed flow:

1. Generate or write a summary.
2. User reviews the summary.
3. User creates a proposal, approval request, issue, or document draft from the summary.
4. The relevant existing approval/document/issue flow applies the change.
5. Activity logs link the original room, summary, proposal, and applied target.

This keeps meetings useful for coordination while preserving auditability and explicit operator control.

## 13. Security, Privacy, and Access

1. Company access controls all room reads and writes.
2. Agent API keys must not access rooms outside the agent's company.
3. Agent participants should only receive room context through explicit invocation.
4. Meeting messages can contain sensitive operational context. Do not store secrets in metadata.
5. Redaction rules used for run logs and runtime summaries should also apply to meeting summaries and agent-generated messages.
6. Closed and archived rooms remain part of audit history.
7. Deleting a user/agent should not erase authored meeting history; use display fallbacks for missing actors.
8. Summary generation should avoid including unrelated project documents, raw runtime memory, private skill files, or cross-company content.
9. Activity logs should record room creation, participant changes, status changes, message deletion, summary acceptance, proposal creation, and applied summary-derived changes.

## 14. Scenario Coverage

### 14.1 User-Created Ad-Hoc Room

1. User selects "Create room".
2. User enters title and optional brief.
3. User invites one or more agents.
4. Paperclip creates `meeting_rooms` with `origin_kind = user_created`.
5. Paperclip creates `meeting_participants` for the user and invited agents.
6. Agents remain `invited` until explicitly invoked or until they contribute through a later run.

### 14.2 Room Linked to Company and Optional Work Context

1. User creates a room from the company, project, issue, or roadmap document surface.
2. Paperclip sets `company_id` and optional `project_id`, `issue_id`, or `project_document_id`.
3. The transcript can use that context for display and future prompt construction.
4. The linked work object does not change unless a separate approved operation changes it.

### 14.3 Issue/Task-Triggered Room

1. User or system starts a discussion from an issue.
2. Paperclip creates `meeting_rooms` with `origin_kind = issue_triggered` and `issue_id`.
3. The issue assignee does not change.
4. The issue checkout/execution lock does not change.
5. Summaries can later propose issue updates or child issues through existing governed flows.

### 14.4 Agent-to-Agent Participants

1. A user or future automation creates a room with two or more agent participants.
2. The room stores those agents as participants.
3. No heartbeat runs until an explicit invocation action is performed.
4. Each explicit agent response is stored as a message linked to that run.

### 14.5 Summary Feeding Documents and Reflections

1. A user requests a summary of the room.
2. Paperclip stores a `meeting_summaries` record.
3. User chooses "propose update to roadmap", "create issue", or "record reflection input".
4. Paperclip creates the appropriate proposal, issue, document draft, or reflection record.
5. Canonical project documents/reflections are changed only through their explicit flows.

## 15. Migration and Rollout Plan

Phase 6.1:

- Add this design document only.
- Do not add schema, migrations, routes, shared types, UI, runtime code, or tests that execute product behavior.

Phase 6.2:

1. Add DB schema for `meeting_rooms`, `meeting_participants`, `meeting_messages`, and `meeting_summaries`.
2. Generate migrations and export schema from `packages/db`.
3. Add shared validators and API path constants.
4. Add server services/routes with company access checks and activity logging.
5. Add minimal UI list/detail/create flow.
6. Add targeted tests for schema constraints, route validation, and UI empty states.

Later phases:

- Add explicit room-driven agent invocation.
- Add summary-to-proposal integration.
- Add realtime message updates.
- Add team participant expansion when teams are canonical.
- Add retention/export controls.

## 16. TODO / Phase 6.2 Handoff

Exact next implementation slices:

1. Schema slice: define Drizzle tables/enums/indexes for `meeting_rooms`, `meeting_participants`, `meeting_messages`, and `meeting_summaries`; export them; generate migration.
2. Shared contract slice: add zod validators, inferred types, and API path constants for create/list/get room, participant mutation, message posting, and summary mutation.
3. Server service slice: implement company-scoped room creation/list/get/update with linked-entity validation and activity logging.
4. Transcript slice: implement participant mutation and ordered message posting with atomic room-local `sequence`.
5. Summary slice: implement manual summary creation and status transitions without applying changes to target documents/issues.
6. UI slice: add company-scoped room list, room detail, create flow, participant display, message composer, and summary panel.
7. Context-entry slice: add entry points from issue detail, project detail, project roadmap/document tabs, and agent detail meetings tab.
8. Verification slice: add targeted route/service/UI tests, then run the smallest relevant checks before broader PR-ready verification.

## 17. Acceptance Checklist

- [ ] The model supports direct user-created rooms.
- [ ] The model supports inviting one or more agents to a room.
- [ ] The model supports rooms linked to company plus optional project, issue/task, or project roadmap document context.
- [ ] The model supports issue/task-triggered room creation without changing issue assignment or checkout state.
- [ ] Agent-to-agent participants are represented without implying automatic agent execution.
- [ ] Messages are ordered and auditable.
- [ ] Summaries are durable records linked to decisions/issues/docs/reflections.
- [ ] Summaries can feed project documents and reflections through proposal/approval flows.
- [ ] Summaries cannot directly mutate shared canonical state.
- [ ] All resources are company-scoped and compatible with Paperclip activity/audit expectations.
