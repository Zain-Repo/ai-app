# Convex conversation index name fix

## Outcome

Renamed the staged `conversations` composite index to
`by_owner_id_project_id_status_output_mode_updated_at`. The new 52-character
identifier preserves all indexed fields in its name and satisfies Convex's
64-character identifier limit, allowing schema evaluation to proceed.

## Affected area

- `convex/schema.ts`

## Validation

- Convex dry-run code generation, schema bundling, and TypeScript checking
  passed.
- The new index name passed Convex's documented length and character
  constraints.
- The changed schema passed Prettier validation.
- `git diff --check` passed.

## Known limitation

The corrected schema was validated locally without deploying it to the remote
Convex deployment.
