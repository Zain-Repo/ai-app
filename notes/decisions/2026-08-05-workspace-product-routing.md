# Workspace identity follows conversation output mode

## Decision

Represent the active Dev3 product with the optional route search value
`workspace=chat|image`. Missing or invalid values resolve to Dev3 Chat for
backwards compatibility. A stored conversation is authoritative when opened:
`outputMode: "image"` maps to Dev3 Image, while `"text"` and legacy missing
values map to Dev3 Chat.

Workspace switches clear the current conversation, project, Library mode, and
message target so each product opens at a clean home. Projects and Library stay
shared, but recent, project, and archived conversation lists are filtered on
the server by output mode.

## Consequences

- Deep links remain stable and self-correct to the conversation's product.
- Existing text history requires no data migration.
- Image generation continues to use the existing conversation and provider
  pipeline instead of creating a parallel storage model.
- New compound Convex indexes are required for bounded owner, project, and
  unassigned workspace-history queries.

## Deployment sequence

The feature branch intentionally contains two ordered commits. Deploy the
first commit, which declares the three new indexes as staged, and wait until
the Convex dashboard reports that every backfill is complete. Only then deploy
the branch head, which activates the indexes and the queries that use them.
The feature pull request must remain a draft until that prerequisite deploy is
complete.
