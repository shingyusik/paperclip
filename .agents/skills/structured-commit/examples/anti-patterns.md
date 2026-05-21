# Anti-Patterns

Avoid these when preparing Paperclip commits.

## Bad Tags

```text
[codex] Add document library routes
```

Actor/provenance tags are not commit intent. Use `[ADD]`, `[FIX]`, `[UPDATE]`,
etc.

```text
[fix] Prefix document navigation routes
```

Tags must be uppercase.

```text
[HOTFIX] Patch redirect
```

Use `[FIX]`. `hotfix/...` may be a branch category, but it is not a commit tag
for this skill.

## Bad Subjects

```text
[UPDATE] Update files
```

Too vague. Name the behavior or surface being changed.

```text
[FIX] Fixed document navigation
```

Use imperative mood: `Fix document navigation prefixing`.

```text
[ADD] Add stuff for docs.
```

Avoid vague nouns and trailing punctuation.

## Bad Bodies

```text
Generated with AI assistance.
```

Do not add AI attribution or tool provenance.

```text
- changed CompanyDocuments.tsx
- changed company-routes.ts
```

The body should explain intent and behavior, not repeat filenames from the
diff.

## Unsafe Operations

Do not use destructive cleanup to make a commit easier:

- `git reset --hard`
- `git checkout -- <file>`
- `git restore <file>`
- `git clean -fd`

If mixed user edits make clean staging difficult, stop and explain the blocker
or use a safe patch-based split.
