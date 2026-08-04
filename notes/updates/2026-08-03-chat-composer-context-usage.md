# Chat composer context usage

## Outcome

The chat composer now uses the AI Elements `Context` component to show the
latest measured response's context-window usage. Hosted OpenAI and OpenRouter
responses persist the provider-reported final-step total token count, and the
indicator compares it with the context window for the model that produced that
response.

Missing usage metadata is treated as unavailable. The UI does not estimate or
fabricate values for legacy messages or providers that do not report usage.

## Affected areas

- AI Elements context component and chat composer integration
- Hosted response completion and conversation message metadata
- OpenAI and OpenRouter model context-window metadata
- Focused component, catalog, and persistence tests

## Validation

- `bun run test`: 49 files and 228 tests passed
- `bun run typecheck`: passed
- Scoped ESLint for changed TypeScript and TSX files: passed
- `bun run build`: passed with existing route-export and chunk-size warnings
- `git diff --check`: passed with Windows line-ending warnings only

## Known limitations

- Desktop Codex responses do not currently expose token usage, so the indicator
  stays hidden for those responses.
- Existing messages do not have historical context-usage metadata.
- Per-token breakdowns, cost reporting, and usage summaries remain part of the
  broader usage-tracking task.
