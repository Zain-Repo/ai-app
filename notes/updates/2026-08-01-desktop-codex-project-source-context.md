# Restore Project source context for desktop Codex

Desktop Codex chats now request a bounded, owner-authorized projection of the
active Project's indexed sources before invoking the local Codex runtime.

## Implementation

- The backend validates the authenticated user owns the conversation and its
  Project before resolving the latest user request.
- It reuses the Project's pinned embedding profile for semantic retrieval and
  returns only retrieved excerpts, never provider credentials.
- When semantic retrieval has no usable result, it falls back to at most three
  current indexed chunks per Project file. Stale fingerprints and deleted
  sources are excluded.
- The renderer inserts the projection as an untrusted `user` message immediately
  before the current prompt; it is never included in Codex developer
  instructions.
- Context retrieval is optional for desktop generation: failures log a concise
  warning and continue without Project-source context rather than reporting a
  Codex authentication failure.

## Affected areas

- `convex/conversations.ts`: authenticated conversation-to-Project retrieval
  request validation.
- `convex/openRouterResponses.ts`: bounded desktop Codex Project-context action
  that reuses semantic retrieval without exposing provider credentials.
- `convex/projectEmbeddings.ts`: current-source fallback chunk projection.
- `src/routes/chat.{-$slug}.tsx`: user-priority source context sent to the
  Electron Codex runtime.
- `convex/desktopCodex.test.ts`: ownership, fallback, stale, and deleted-source
  coverage.

## Validation

- Focused desktop Codex, Project embedding, and provider bridge tests passed.
- TypeScript type checking and `git diff --check` passed.

## Known limitation

- Live authenticated desktop Codex generation against a configured embedding
  provider was not exercised in this environment. Validation is limited to
  deterministic tests, type checking, Convex code generation, and diff checks.
