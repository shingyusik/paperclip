# [ADD] New Capability Example

Use `[ADD]` when the commit introduces a new capability, route, schema,
service, UI surface, adapter, skill, or other project artifact that did not
exist before.

## Good Message

```text
[ADD] Add company document library

- Add company-scoped document folder and markdown document tables
- Expose document listing and detail routes through the server API
- Add the initial document library UI entry point for saved outputs
```

Why it works:

- The tag matches a new capability.
- The subject names the feature, not the tool or implementation detail.
- The body explains the cross-layer shape without restating every file.

## Staging Shape

This can be one commit if the capability is only useful when shipped together:

- `packages/db/src/schema/company_documents.ts`
- `packages/db/src/migrations/...`
- `packages/shared/src/types/company-document.ts`
- `server/src/routes/company-documents.ts`
- `ui/src/pages/CompanyDocuments.tsx`

Split it only if the diff is large enough that schema/API/UI review would be
clearer as separate commits.
