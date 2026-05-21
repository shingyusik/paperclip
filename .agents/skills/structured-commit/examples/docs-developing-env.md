# [DOCS] Documentation-Only Example

Use `[DOCS]` when the commit changes only Markdown, comments, or contributor
guidance and does not alter runtime behavior.

## Good Message

```text
[DOCS] Document repo-local dev environment

- Explain how PAPERCLIP_HOME isolates local development data
- Clarify when DATABASE_URL should be left unset for embedded development
- Keep the command examples aligned with AGENTS.md and doc/DEVELOPING.md
```

Why it works:

- The tag says this is documentation-only.
- The subject names the guide-level change.
- The body explains what confusion the docs remove.

## Tag Boundary

If the same commit also changes `scripts/dev-runner.ts`, `.env.example`, or
runtime configuration, use `[UPDATE]` or `[FIX]` instead of `[DOCS]` because the
commit changes behavior.
