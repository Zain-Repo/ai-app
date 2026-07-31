# Pin Project embeddings to an owned provider profile

## Context

Project sources need one stable embedding space for both document indexing and
query retrieval. Chat generation can move between providers, but using the
currently selected chat provider for every retrieval request would mix vector
spaces, make billing unpredictable, and silently depend on credentials that may
not support embedding APIs.

The application stores user-owned provider connections for OpenRouter, OpenAI,
ChatGPT/Codex, and Cursor. Only an OpenRouter OAuth key or direct OpenAI API key
can authorize the server-side embedding endpoint required by this feature.
ChatGPT subscriptions and desktop Codex or Cursor sessions are not general
embedding API credentials.

## Decision

Each Project pins one owned, connected OpenAI or OpenRouter connection in a
versioned embedding profile. The profile records the provider-specific model,
fixed dimensions, connection, and revision used by every source vector and
retrieval query for that Project.

- OpenAI uses `text-embedding-3-small`.
- OpenRouter uses `openai/text-embedding-3-small`.
- Both profiles require exactly 1536 finite vector values.
- ChatGPT/Codex and Cursor connections are never accepted as Project embedding
  credentials.
- Chat generation may use another provider, but Project retrieval continues to
  use the pinned embedding profile and its owned credential.
- Changing the connection, provider, model, or vector dimensions requires an
  explicit new profile revision and complete re-index. The system does not mix
  vectors or silently fall back to another provider.
- The first implementation indexes uploaded text-like files only. It does not
  fetch links or attempt server-side parsing of binary document formats.

## Consequences

- Indexing cost, retrieval cost, credential failures, and reauthentication are
  attributable to one visible Project-level provider choice.
- Owner, Project, profile revision, and source fingerprint checks can reject
  cross-tenant, stale, or superseded chunks before prompt construction.
- Provider switches temporarily return sources to queued indexing while the UI
  can continue using direct file context until the new index becomes ready.
- Superseded profile chunks and index states require bounded asynchronous
  cleanup after a switch.
- Users without an eligible OpenAI or OpenRouter connection can still attach
  sources, but semantic indexing reports `provider_required` and remains
  inactive.
- Adding PDF, Office, or URL support requires a separately reviewed extraction
  boundary. URL support must include SSRF protections, redirect and DNS checks,
  MIME and size limits, and timeouts before it can enter the indexing pipeline.

## Evidence

- The embedding profile is referenced by every source index state and chunk;
  vector-search scope includes the owner, Project, and profile revision.
- Indexing and retrieval validate connection ownership, provider, connection
  status, credential presence, model identifier, dimensions, and current
  Project revision.
- Tests reject Codex and foreign connections, reject malformed vectors and
  invalid profile metadata, prevent cross-owner and stale-profile hydration,
  and verify explicit revision changes and cleanup.
