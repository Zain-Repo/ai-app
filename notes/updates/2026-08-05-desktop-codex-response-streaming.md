# Desktop Codex response streaming

## Outcome

Desktop chats authenticated through a ChatGPT subscription now render Codex
assistant text while it is generated. The Electron client consumes the official
Codex App Server `item/agentMessage/delta` notification, correlates each delta
with its originating renderer request, and updates the pending Convex message in
order. The completed app-server item remains the authoritative final response.

## Reliability and security

- Delta IPC events are scoped by a generated request identifier and accepted
  only from the trusted renderer already enforced by the desktop IPC boundary.
- App-server notifications are filtered to the active thread and agent-message
  event type; reasoning deltas and unrelated threads are not exposed as answer
  text.
- Incremental Convex writes are serialized and batched at 75 milliseconds to
  avoid out-of-order content and a database mutation per token.
- A live-update persistence failure degrades to the existing final-response
  write instead of failing an otherwise successful model response.
- The streaming mutation reuses the authenticated owner, connected Codex
  provider, pending-message count, and response-length checks used at final
  completion.

## Affected areas

- `electron/main/codex-app-server.ts`
- `electron/main/index.ts`
- `electron/preload/index.ts`
- `electron/types.ts`
- `convex/conversations.ts`
- `src/routes/chat.{-$slug}.tsx`
- Focused Codex protocol and conversation tests

## Validation

- TypeScript type checking passed.
- All 262 Vitest tests across 59 files passed.
- Scoped ESLint and Prettier checks passed for every changed source and test
  file.
- The production client and SSR build passed with the existing non-route test
  file warning.
- The bundled Codex App Server initialized and accepted `account/read` in the
  desktop smoke test.
- `git diff --check` passed.

## Known limitation

The repository-wide ESLint command remains blocked by pre-existing bundled
`.agents` templates, generated files, and unrelated UI lint findings. No live
authenticated model turn was run during validation; protocol parsing and
reactive message persistence are covered by focused tests.
