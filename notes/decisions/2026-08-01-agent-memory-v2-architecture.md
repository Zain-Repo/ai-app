# Agent Memory v2 architecture

## Context

The legacy saved-memory path was coupled to OpenRouter chat generation, stored
provider-specific vectors without a processing profile, and placed recalled
content at instruction priority. Other agent paths could not receive the same
owner-scoped context, and asynchronous capture, deletion, and provider failures
did not have a shared lifecycle.

## Decision

- Use one owner-scoped, revisioned memory processing profile backed only by a
  user-owned OpenAI API key or OpenRouter OAuth connection. The selected
  provider pays for extraction and embeddings independently of the chat model.
- Pin extraction and `text-embedding-3-small` model identifiers, 1,536 vector
  dimensions, and the policy revision in code. Arbitrary model selection is not
  part of v1.
- Keep saved memory and conversation-history summaries as separate layers. Each
  conversation has a `standard`, `read_only`, or `off` mode, and project
  `project_only` scope governs both recall and capture.
- Treat memory as bounded, quoted, untrusted user reference data inserted
  immediately before the current request. It never becomes a system or
  developer instruction.
- Combine exact/scoped selection, full-text search, and profile-matched vector
  search with reciprocal-rank fusion. Include at most eight selected memory
  items within the shared 2,000-token memory budget.
- Automatically activate only safe, durable, direct statements. Ambiguous,
  conflicting, history-derived, and sensitive information cannot influence a
  response before confirmation. Credentials, authentication material,
  financial account data, government identifiers, and precise addresses are
  always rejected.
- Keep immutable evidence and version history for corrections. Deletion removes
  recall/search state immediately, uses a short undo window, and retains only a
  hashed key tombstone afterward to prevent stale-job resurrection.
- Use idempotent bounded jobs with profile, policy, source, revision, and content
  rechecks. Provider failure pauses automatic processing while confirmed direct
  and lexical memory remains available.
- Roll out through `MEMORY_V2_ROLLOUT=off|shadow|enabled`; an unset value is
  `shadow`. Off writes only the legacy store, shadow safely dual-writes confirmed
  normal memories while comparing v2 retrieval, and enabled writes v2 only.
  Migrate legacy rows through a cursor-paginated, idempotent worker while
  preserving a legacy-preferred response envelope until enablement.
- Keep coding-agent paths, commands, diffs, credentials, and runtime state local
  to the desktop. Only the bounded memory projection may cross into Convex.

## Consequences

- Users see the processing provider, pinned models, health, billing ownership,
  candidates, provenance, history controls, and per-response memory sources in
  Personalization.
- OpenRouter, OpenAI, desktop Codex, realtime voice, and image requests use the
  same context contract and selected memory identifiers.
- Confirmed sensitive memories remain outside provider embeddings and are
  available only through bounded direct selection after explicit confirmation.
- Account, project, conversation, history, retention, and tombstone cleanup are
  bounded and idempotent. Hourly retention advances a persistent owner cursor so
  every account is eventually visited.
- Enabling v2 in production is an explicit operational decision after shadow
  parity has been inspected.
