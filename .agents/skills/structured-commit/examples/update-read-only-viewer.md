# [UPDATE] Existing Behavior Example

Use `[UPDATE]` when changing existing behavior or interaction semantics without
framing it as a bug.

## Good Message

```text
[UPDATE] Make document library read-only viewer

- Remove user-facing create, edit, save, and delete controls from the page
- Keep the left pane as a document tree and the right pane as rendered markdown
- Auto-select the first saved document so the viewer is the primary experience
```

Why it works:

- The tag reflects a product behavior change.
- The subject is specific and imperative.
- The body explains the UX intent, not just deleted components.

## Commit Boundary

This should stay separate from API/schema work because it changes the UI
contract and reviewer expectations. If server write endpoints remain for agents
or future automation, do not remove them in the same commit unless the task
explicitly asks for that.
