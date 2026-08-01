# OpenRouter canonical model endpoints

## Outcome

OpenRouter model endpoint lookups now support canonical provider aliases that
begin with `~`, while continuing to support ordinary two-segment image model
IDs. A successful response with no available endpoints now returns an empty
list instead of failing the Convex action. Malformed successful responses still
fail as invalid provider endpoint catalogs.

## Root cause

The live OpenRouter catalog now includes canonical model IDs with a leading
`~` in the provider segment. The previous allowlist rejected those IDs before
the endpoint request was made. Current live image-only IDs use ordinary valid
two-segment IDs, so the observed exception was alias-related rather than
image-specific.

## Affected areas

- `convex/providerOAuth.ts`: validates a leading `~` only in the provider
  segment, preserves two-segment and character restrictions, and builds the
  encoded endpoint URL.
- `convex/providerOAuth.test.ts`: covers canonical aliases, an image model,
  malformed and path-injection-like identifiers, and valid-empty versus invalid
  endpoint catalogs.

## Validation

- Full Vitest suite passed: 36 files and 157 tests.
- TypeScript type checking passed.
- Scoped ESLint and Prettier checks passed.
- Production client and SSR build passed, with the existing chat-sidebar route
  test warning.
- `git diff --check` passed.
- Public OpenRouter endpoint checks verified that an alias route returns a
  valid empty catalog and an image-model route returns an endpoint.

## Known limitation

The endpoint catalog remains provider-controlled, so an empty list means the
connected OpenRouter account currently has no available providers for that
model. No authenticated Convex action or deployment was exercised.
