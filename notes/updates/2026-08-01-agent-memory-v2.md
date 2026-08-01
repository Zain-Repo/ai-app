# Agent Memory v2

## Outcome

Implemented a provider-neutral personalization service shared by hosted
OpenRouter and OpenAI chat, desktop Codex, realtime voice, and image generation.
The feature is protected by a server rollout mode that defaults to shadow.

## Backend

- Added versioned memory items, evidence, versions, history summaries,
  profile-bound search documents, processing profiles, jobs, tombstones,
  response references, migration runs, and retention sweep state.
- Added conservative provider-backed capture, explicit forget/correction
  handling, sensitive confirmation, capacity enforcement, retry scheduling,
  lexical/vector reciprocal-rank retrieval, and a 2,000-token context budget.
- Added independent saved-memory/history controls, per-chat modes, project-only
  read/write enforcement, source attribution, feedback, clear/undo operations,
  legacy migration, and bounded conversation/project/account erasure hooks.
- Added hourly candidate expiry, review aging, removed-item purge, and tombstone
  retention without recording memory text, prompts, vectors, credentials, or raw
  provider output in logs.

## Agent and UI integration

- Inserted memory only as a quoted user-level reference immediately before the
  current request across hosted generation, desktop Codex, realtime voice, and
  image requests.
- Enqueued capture when complete user messages are committed, independently of
  response success. Realtime capture uses finalized transcripts only.
- Replaced the separate Memory and Preferences dialogs with one accessible
  Personalization center covering defaults, saved memory, candidates,
  provenance, history consent/clear, processing provider/health/retry, sensitive
  confirmation, search, edit, pin, delete, and undo.
- Added per-chat memory mode controls and per-response Memory used disclosure
  with correction/management navigation and helpful, incorrect, or do-not-use
  feedback.

## Validation

- `bunx convex codegen`
- `bun run typecheck`
- `bun run test` — 47 files and 217 tests passed
- Scoped ESLint for all changed TypeScript and TSX files
- `bun run build` — client and SSR builds passed
- `git diff --check`

## Pull request review fixes

- Prevented delayed project-indexing jobs from moving a completed source back
  from `ready` to `indexing`.
- Restored saved-memory enablement and legacy-memory management in the
  Personalization center.
- Included legacy keys in shadow-mode forget extraction while preserving
  provider-neutral v2 capture.
- Prevented read-only chats from contributing history summaries while retaining
  the standard default for pre-migration chats.
- Continued conversation-reference cleanup in bounded batches and staged the
  new user-retention index for a non-blocking production backfill.
- Rejected stale saved-memory and history commits after clear, opt-out, project
  deletion, profile changes, content edits, and source removal.
- Preserved confirmed manual and pinned memories during extraction conflicts;
  one source-backed proposal remains reviewable and confirmation supersedes the
  prior value without exceeding capacity.
- Added idempotent embedding jobs for manual, migrated, corrected, restored,
  and profile-revision memories, including retry routing and commit-time opt-out
  checks.
- Restored history recall in read-only chats, kept project-only summaries
  isolated, and continued project/account cleanup when summary or child-artifact
  batches reach their limit.
- Created and routed new realtime voice chats before session startup so initial
  memory context and finalized transcript capture share one owned project scope.
- Merged the latest account/chat experience changes and retained message bubble
  color controls inside the unified Personalization center.

The build continues to report the pre-existing TanStack Router warning for
`src/routes/chat-sidebar.test.tsx`; the file is excluded from the route tree and
the build succeeds.

## Rollout

Keep `MEMORY_V2_ROLLOUT` unset or set to `shadow` for parity observation. Set it
to `enabled` only after the legacy migration and shadow results are accepted.
Provider-backed processing also requires the user's selected OpenAI API-key or
OpenRouter OAuth connection; disconnection degrades memory processing without
failing chat.
