# Library uses a materialized asset index

## Decision

Store Library entries in an owner-scoped `libraryAssets` table instead of
assembling the feed by scanning conversations, messages, and project sources at
read time.

Live message and project mutations write the origin and Library entry in the
same transaction. Entries store a storage ID, never a signed URL; the list query
authorizes the user before creating short-lived URLs. Origin indexes make live
writes and historical backfills idempotent, and origin deletion removes the
matching Library entry before deleting its storage.

## Consequences

- Library pagination and category filters remain index-backed as history grows.
- Historical content requires the migrations documented in
  `notes/updates/2026-08-03-library.md`.
- A future Library delete action must call the origin-specific deletion flow;
  deleting only the materialized entry would leave the underlying content
  intact.
