# OpenRouter AI SDK usage provenance

## Context

Dev3 uses user-owned OpenRouter credentials for hosted model requests and
OpenRouter's live APIs for model availability and current-key credit status.
The Vercel AI SDK normalizes generation across providers, but locally estimated
prices can diverge from the route OpenRouter actually selected, especially when
fallbacks, caching, tools, or provider-specific surcharges apply.

## Decision

- Create OpenRouter AI SDK clients through one strict provider factory that
  receives the server-decrypted user credential.
- Continue using OpenRouter's authenticated model and current-key APIs as the
  sources of truth for availability and account limits.
- Treat `providerMetadata.openrouter.usage` as the authoritative per-step usage
  source. Aggregate every completed AI SDK step before persisting a response.
- Persist billed cost only when every step provides a valid non-negative cost;
  never fill a missing step with zero or substitute a catalog estimate.
- Store usage as additive optional message metadata tagged with
  `provider: openrouter`, preserving compatibility with legacy and other-provider
  responses.

## Consequences

- Multi-step tool responses retain the total amount OpenRouter billed instead
  of only the final step's cost.
- Existing model selection, routing privacy, key credit status, and OpenRouter
  billing ownership remain unchanged.
- Broader usage summaries and cross-provider estimates can build on this record,
  but must preserve the distinction between reported and estimated values.
