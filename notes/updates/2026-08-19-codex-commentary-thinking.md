# Codex commentary thinking UI

## Outcome

Desktop Codex commentary now appears as live thinking progress instead of being
rendered as final assistant text. Pending responses and streamed commentary use
the installed `ReasoningSteps` component, while completed final-answer content
continues to use the normal assistant response renderer.

## Design

- The Electron app-server bridge records the `phase` from each Codex
  `item/started` agent-message item and associates later
  `item/agentMessage/delta` notifications by `itemId`.
- `commentary` deltas are persisted as bounded reasoning steps. `final_answer`
  deltas are persisted as response content. Messages without phase metadata
  retain the legacy final-answer behavior for older or inconsistent providers.
- Completed commentary is excluded from the final answer and retained in the
  expandable reasoning history alongside reasoning summaries.
- The preload bridge validates the structured delta before exposing it to the
  renderer, and Convex applies the existing reasoning-step limits to both live
  and completed updates.

## Affected areas

- `electron/main/codex-app-server.ts`: phase correlation and completed-item
  separation.
- `electron/preload/index.ts` and `electron/types.ts`: typed, validated delta
  bridge.
- `convex/conversations.ts`: live reasoning-step persistence.
- `src/routes/chat.{-$slug}.tsx`: commentary accumulation and
  `ReasoningSteps` rendering for pending and active thinking states.
- Focused Electron, Convex, and chat-renderer tests cover protocol
  classification, legacy fallback, persistence, and visible thinking UI.

## Validation

- Focused Vitest run passed: 3 files and 34 tests.
- The full suite passed 328 of 329 tests on its default timeout; the sole
  timeout was the unrelated Personalization Center test, which passed all 3
  tests when rerun with the repository's documented 10-second allowance.
- TypeScript type checking passed.
- Scoped ESLint passed for all affected source and test files.
- Scoped Prettier and `git diff --check` passed.
- The production client and SSR build passed with the existing non-route test
  warning.

## Limitations

- No authenticated visual desktop smoke test was performed.
- Providers that omit phase metadata intentionally keep the previous streaming
  behavior because their commentary cannot be distinguished safely.
