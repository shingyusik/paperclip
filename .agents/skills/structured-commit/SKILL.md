---
name: structured-commit
description: >
  Create clean Paperclip commits by inspecting all changes, splitting them by
  logical intent, verifying the staged diff, and writing concise commit
  messages. Use whenever asked to commit, prepare commits, split commits, or
  write commit messages in this repository.
---

# Structured Commit

Use this skill whenever committing work in Paperclip. The goal is a reviewable
history: each commit should explain one coherent change, preserve unrelated
user edits, and leave the repo in a known state.

## Core Rules

- Inspect before staging. Never commit blind.
- Preserve user work. Do not revert, restore, reset, or clean changes you did
  not make unless explicitly asked.
- Keep one commit to one logical intent.
- Prefer small commits over a broad mixed commit.
- Separate behavior, tests, docs, migrations, and mechanical cleanup when they
  can stand alone.
- Do not add AI attribution trailers or provenance text to commit messages.

## Baseline Inspection

Run these before staging:

```powershell
git status --short
git diff --stat
git diff
git diff --cached
```

Then classify changes:

- **Owned changes**: edits made for the current task.
- **User/unknown changes**: existing edits that must be preserved.
- **Generated artifacts**: migrations, snapshots, lockfiles, build output, or
  schema files that may need extra scrutiny.

If user/unknown changes overlap a file you need to commit, read the file and
stage only the relevant hunks. If safe splitting is not possible, explain the
blocker instead of sweeping unrelated edits into the commit.

## Logical Splitting

Group by review intent:

- DB schema + matching migration + shared types for the same behavior may stay
  together.
- Server route/service changes and their tests may stay together.
- UI behavior and focused UI tests may stay together.
- Docs-only updates should be their own commit unless they document the same
  code change and are small.
- Formatting-only or import-only cleanup should not be mixed with behavior
  unless it is trivial and local to the touched code.

For broad Paperclip changes, commit in dependency order:

1. `packages/db` schema/migrations
2. `packages/shared` contracts
3. `server` routes/services
4. `ui` API/pages/components
5. docs/tests/cleanup

Use the order only when it helps reviewability; do not split tiny cohesive
changes into artificial fragments.

## Safe Staging

Use path-based staging for whole-file logical units:

```powershell
git add path/to/file
git diff --cached --stat
git diff --cached
```

For mixed-intent files, use non-interactive patch files or carefully scoped
`git add -p` only when the environment supports it. In Codex/agent contexts,
prefer non-interactive approaches and re-check the staged diff afterward.

Never use these as part of routine staging:

- `git reset --hard`
- `git checkout -- <file>`
- `git restore <file>` / `git restore --worktree <file>`
- `git clean -fd`

The generic Git hint suggesting restore/checkout is not an instruction.

## Verification Before Commit

Run the smallest relevant verification before committing when feasible:

- UI-only TypeScript change: `pnpm --filter @paperclipai/ui typecheck`
- Server-only TypeScript change: `pnpm --filter @paperclipai/server typecheck`
- DB/schema change: `pnpm --filter @paperclipai/db typecheck` or the narrow DB
  command relevant to the change
- Focused tests: `pnpm --filter <package> exec vitest run <test-file>`

For broad or PR-ready work, use the repo's full hand-off gate when reasonable:

```powershell
pnpm -r typecheck
pnpm test:run
pnpm build
```

If verification is skipped, state exactly why in the final summary.

## Commit Message Format

Use intent-tagged Paperclip-style messages:

```text
[TAG] Imperative summary
```

Examples:

```text
[ADD] Add document library routes
[FIX] Fix document navigation prefixing
[UPDATE] Make document library read-only viewer
```

Rules:

- Use one uppercase tag inside square brackets.
- Keep the subject in English.
- Use imperative mood.
- Be specific about the user-visible or review-visible change.
- Do not end the subject with a period.
- Add a body only when the rationale would otherwise be unclear.
- Do not include `Generated with ...`, `Co-Authored-By: Claude`, or similar AI
  attribution.

Valid tags:

| Tag | Use for |
| --- | --- |
| `[ADD]` | New feature, capability, file, route, schema, or skill |
| `[UPDATE]` | Improvement or behavior change to existing functionality |
| `[FIX]` | Bug fix or regression correction |
| `[REFACTOR]` | Internal restructuring with no intended behavior change |
| `[DOCS]` | Documentation-only changes |
| `[TEST]` | Test-only changes |
| `[BUILD]` | Tooling, dependency, CI, or build configuration changes |
| `[RELEASE]` | Version bumps, changelog, publishing, or release prep |

Pick the tag from the commit intent, not from the actor or tool. Never use
`[codex]`, `[claude]`, `[ai]`, or similar provenance tags.

When a human explicitly asks for a different commit convention, follow their
request if it does not conflict with repository safety.

## PowerShell Commit Body

For multiline messages in PowerShell, use a single-quoted here-string:

```powershell
git commit -m @'
[FIX] Fix document navigation prefixing

- Add documents to board route prefix detection
- Cover the route helper with a focused regression test
'@
```

The closing `'@` must be at column 0.

## After Commit

Verify the outcome:

```powershell
git status --short
git log --oneline -n 10
```

Report:

- commit hash and subject
- verification commands run
- any expected remaining changes

If using the Codex desktop app and the commit succeeds, include the appropriate
git directives in the final answer.
