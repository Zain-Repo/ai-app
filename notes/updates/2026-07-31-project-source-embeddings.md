# Add Project source embeddings

## Outcome

Added semantic indexing and retrieval for text-like files attached to Projects.
Each Project pins an owned OpenAI or OpenRouter connection in a versioned
embedding profile. Files are indexed asynchronously, expose durable progress
and error states, and contribute bounded, explicitly untrusted source excerpts
to Project chats regardless of which supported provider generates the chat
response.

## Affected areas

- The Convex schema now separates Project embedding profiles, per-source index
  states, and source chunks with a 1536-dimension vector index scoped by owner,
  Project, and profile revision.
- Project creation and source management can configure, switch, retry, inspect,
  and remove embedding-backed sources. Switching providers creates a new
  profile revision and schedules a complete re-index.
- OpenAI and OpenRouter use a shared, strictly validated embedding bridge with
  provider-specific `text-embedding-3-small` model identifiers. Existing Memory
  embedding behavior continues to use OpenRouter through the same bridge.
- Deterministic text normalization, fingerprinting, overlapping chunking,
  batched embedding, stale-job checks, and bounded cleanup make indexing
  idempotent and prevent superseded vectors from entering retrieval.
- Response generation embeds the latest user request with the Project's pinned
  credential, hydrates only authorized current-profile chunks, and adds the
  selected excerpts as untrusted reference data. A file remains available
  through the previous direct-attachment path until its current index is ready
  or partially ready.
- The Project Sources interface exposes provider configuration, explicit
  provider switching and re-index confirmation, indexing progress, durable
  errors, retry, indexed chunk counts, and source removal.

## Validation

- `bun run typecheck`
- Scoped ESLint for the changed Convex implementation and tests
- Full Convex test suite: 14 files and 56 tests passed
- Focused Project embedding, Project, and provider-response tests: 18 tests
  passed
- `git diff --check -- convex`

The tests cover provider and owner authorization, profile revisions, model and
dimension integrity, exact vector validation, stale-profile and cross-owner
retrieval rejection, queued-file fallback, ready-file retrieval behavior, and
bounded source, Project, and superseded-profile cleanup.

## Known limitations

- Initial indexing supports text-like uploaded files only. Links, PDF, Office,
  image, audio, and other binary sources remain unsupported for embedding and
  are not fetched or parsed by the backend.
- Indexing and semantic retrieval consume the pinned provider account's API
  credits. There is no silent credential or provider fallback.
- Changing the provider or embedding model requires a complete Project
  re-index because vectors from different embedding spaces cannot be mixed.
- A readable text source is capped and may be marked partially indexed when it
  exceeds the configured text or chunk bounds.

