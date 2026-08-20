# Vercel AI SDK OpenRouter backend

## Summary

Standardize hosted OpenRouter generation on the current Vercel AI SDK provider
without replacing OpenRouter's live model catalog, user-owned API keys, routing,
or billing source of truth.

## Implementation

1. Centralize strict OpenRouter AI SDK client creation for chat, title, and
   embedding requests.
2. Keep model discovery and current-key credit status backed by OpenRouter's
   authenticated APIs.
3. Capture the OpenRouter usage metadata returned through AI SDK provider
   metadata, aggregate multi-step tool runs, and persist exact billed cost only
   when every step reports it.
4. Preserve existing privacy routing, cancellation, streaming, tool execution,
   and insufficient-credit behavior.

## Acceptance criteria

- Every hosted OpenRouter AI SDK request uses the user's encrypted-at-rest,
  server-decrypted OpenRouter credential.
- Model availability and key limits remain provider-controlled and are not
  replaced by a local catalog or billing estimate.
- Completed OpenRouter text responses may store validated token counts, cache
  and reasoning details, and provider-reported billed cost.
- Missing or malformed usage metadata cannot fail an otherwise completed
  response and never produces a partial cost total.

## Security and reliability constraints

- Never persist or log provider credentials.
- Treat provider metadata as untrusted and validate every persisted number.
- Preserve OpenRouter data-collection denial and zero-retention routing
  settings.
- Keep the schema change additive and compatible with existing messages.

## Validation

- Focused usage aggregation and response persistence tests.
- TypeScript, ESLint, Prettier, full Vitest, production build, and diff checks.

## Out of scope

- A replacement payment system or local credit ledger.
- Historical usage backfill.
- Changing image-generation capability routing or direct OpenRouter catalog
  endpoints.
