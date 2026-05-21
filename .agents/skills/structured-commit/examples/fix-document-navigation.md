# [FIX] Bug-Fix Example

Use `[FIX]` when correcting behavior that is broken, surprising, regressed, or
inconsistent with nearby UI/API behavior.

## Good Message

```text
[FIX] Prefix document navigation routes

- Add documents to board route prefix detection
- Prevent the sidebar link from routing through the unprefixed redirect
- Cover the route helper with a focused regression test
```

Why it works:

- The tag identifies this as a defect correction.
- The subject says what now works.
- The body captures cause, effect, and verification surface.

## Commit Boundary

Keep the fix and its focused regression test together:

- `ui/src/lib/company-routes.ts`
- `ui/src/lib/company-routes.test.ts`

Do not mix unrelated visual polish or new document viewer features into the
same commit.
