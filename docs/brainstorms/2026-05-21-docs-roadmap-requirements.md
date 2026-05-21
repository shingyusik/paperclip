---
date: 2026-05-21
topic: docs-roadmap
---

# Documents And Roadmap Requirements

## Summary

Add a company-level document library and project-level roadmap tab to Paperclip. The document library gives each AI-agent company a Markdown-first place for goals, project context, references, and durable outputs, while the roadmap tab visualizes each project's milestones and linked backlog issues.

---

## Problem Frame

Paperclip already treats outputs as part of the control-plane loop: issues can have comments, documents, attachments, and work products. That keeps work inspectable while it is happening, but the durable knowledge of the company still tends to remain scattered across issue details and execution transcripts.

Operators need a higher-level place to see what the company knows and what each project is working toward. Business goals, project descriptions, research notes, intermediate deliverables, and final reports should be easy to find after the issue that produced them is no longer active. Project execution also needs a roadmap view that explains the sequence of work, not only a flat issue list.

---

## Actors

- A1. Board operator: Creates, organizes, reads, and edits company documents and project roadmaps.
- A2. Agent contributor: Produces issue outputs that may later become durable documents or backlog items.
- A3. Project lead agent or human: Uses milestones and backlog state to understand project progress and next work.

---

## Key Flows

- F1. Browse company documents
  - **Trigger:** A board operator opens the Documents tab for a company.
  - **Actors:** A1
  - **Steps:** The operator sees a folder tree, selects a Markdown document, and reads the rendered content with access to edit or create actions.
  - **Outcome:** Company-level knowledge is visible outside individual issue threads.
  - **Covered by:** R1, R2, R3, R4

- F2. Maintain project roadmap
  - **Trigger:** A board operator opens the Roadmap tab for a project.
  - **Actors:** A1, A3
  - **Steps:** The operator creates or edits milestones, links backlog issues to milestones, and scans progress by issue status.
  - **Outcome:** The project has a visible execution plan organized by milestone.
  - **Covered by:** R6, R7, R8, R9, R10

- F3. Preserve a useful output manually
  - **Trigger:** A board operator identifies an issue document, note, or work product worth preserving.
  - **Actors:** A1, A2
  - **Steps:** The operator creates or updates a company document using the useful output as source material, places it in a folder, and links back to the source issue when relevant.
  - **Outcome:** Valuable work can graduate from task-local context into company memory without automatic ingestion.
  - **Covered by:** R4, R5, R11

---

## Requirements

**Company document library**
- R1. Each company must have a Documents tab or equivalent company-scoped navigation surface.
- R2. The document library must support folder-style organization for Markdown documents.
- R3. Selecting a document must show rendered Markdown content, not only raw text.
- R4. Board operators must be able to create, edit, rename, move, and delete documents and folders.
- R5. Documents should be able to reference their source context, such as a project or issue, when the document came from work already tracked in Paperclip.

**Project roadmap**
- R6. Each project must have a Roadmap tab or equivalent project-scoped navigation surface.
- R7. A project roadmap must be organized around project-level milestones.
- R8. Each milestone must be able to contain or link backlog issues for that project.
- R9. The roadmap must show useful progress signals for each milestone, including counts by issue status.
- R10. Board operators must be able to create, edit, reorder, and archive milestones.

**MVP scope and product behavior**
- R11. The first version is manually managed: users decide which documents to create and which outputs to preserve.
- R12. Company documents and project roadmaps must stay company-scoped and must not expose content across company boundaries.
- R13. The feature should reuse Paperclip's existing work model conceptually: documents preserve durable knowledge, while issues remain the executable backlog.

---

## Acceptance Examples

- AE1. **Covers R1, R2, R3.** Given a company has Markdown documents in multiple folders, when the board operator opens Documents and selects a file, the UI shows the folder tree and rendered Markdown for the selected document.
- AE2. **Covers R6, R7, R8, R9.** Given a project has three milestones and linked issues in several statuses, when the board operator opens Roadmap, the UI shows the milestones and status-based progress for their linked backlog.
- AE3. **Covers R11.** Given an agent produces a useful issue output, when the MVP ships, the output is not automatically saved into the document library; a board operator must intentionally preserve it.
- AE4. **Covers R12.** Given two companies exist in the same Paperclip instance, when a board operator is viewing one company's documents or roadmaps, content from the other company is not shown in that context.

---

## Success Criteria

- A board operator can understand a company's durable knowledge without opening old issues one by one.
- A board operator can understand a project's plan by scanning milestones and linked backlog work.
- Planning can proceed without inventing whether documents are company-scoped, whether roadmaps are project-scoped, or whether automatic agent ingestion is part of the first version.
- The first implementation remains small enough to validate the product surface before adding agent-assisted curation.

---

## Scope Boundaries

- Agent-generated document save proposals and approval flows are deferred.
- Automatic document classification, summarization, and cleanup are deferred.
- Agent-suggested roadmap or milestone restructuring is deferred.
- A company-wide roadmap across all projects is out of scope for this first version.
- This is not a replacement for Notion, Jira, or an external knowledge base; it is a Paperclip-native surface for company memory and project execution.
- Rich file formats beyond Markdown are out of scope for the first version.

---

## Key Decisions

- Company documents and project roadmaps are separate surfaces: company documents hold strategy and knowledge, while project roadmaps hold execution structure.
- The first version is manual-first: this validates navigation, rendering, editing, and roadmap organization before adding agent-assisted curation.
- Roadmaps are milestone-centered: this gives projects a visible sequence of work while keeping backlog items tied to issues.
- Documents are Markdown-first: this matches Paperclip's existing text-first issue document direction and keeps the first version portable.

---

## Dependencies / Assumptions

- Existing issue documents, issue work products, and project issue lists provide enough adjacent product context for the MVP to feel connected rather than isolated.
- Board operators are the primary editors for the MVP.
- Agent-authored outputs remain task-local until a board operator manually preserves them.
- Planning may decide the exact persistence shape and routing, but the product behavior should preserve company scoping and project scoping.

---

## Outstanding Questions

### Deferred to Planning

- [Affects R2, R4][Technical] Determine how folder organization should be represented while staying compatible with existing document behavior.
- [Affects R8, R9][Technical] Determine whether milestone issue membership is modeled as an issue field, a linking relation, or another project-scoped structure.
- [Affects R5][Technical] Determine how source links should appear in the UI for documents derived from issue outputs.
