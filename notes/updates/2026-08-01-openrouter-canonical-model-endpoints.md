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

A second client-side race could still issue the endpoint action with a model
from the previously active provider while the next provider catalog was
loading. The catalog is now tagged with its source provider and connection,
and is unavailable until both match the active selection. Endpoint lookups
also require the selected model object from that matching catalog, including
after output-mode changes.

## Affected areas

- `convex/providerOAuth.ts`: validates a leading `~` only in the provider
  segment, preserves two-segment and character restrictions, filters invalid
  catalog IDs, builds the encoded endpoint URL, and returns an empty list for
  invalid action input before credential lookup.
- `src/routes/chat.{-$slug}.tsx`: only exposes a catalog when its source
  provider and connection match the active selection, and uses the selected
  matching model value for endpoint requests.
- `convex/providerOAuth.test.ts` and `src/routes/chat-sidebar.test.tsx`:
  cover canonical aliases, malformed and path-injection-like identifiers,
  unauthenticated invalid action input, and catalog source mismatches.

## Validation

- Focused Vitest regression suite passed: `convex/providerOAuth.test.ts` and
  `src/routes/chat-sidebar.test.tsx` (25 tests).
- TypeScript type checking, scoped ESLint, and `git diff --check` passed.
- Full Vitest suite passed: 36 files and 157 tests.
- TypeScript type checking passed.
- Scoped ESLint and Prettier checks passed.
- Production client and SSR build passed, with the existing chat-sidebar route
  test warning.
- `git diff --check` passed.
- Public OpenRouter endpoint checks verified that an alias route returns a
  valid empty catalog and an image-model route returns an endpoint.
- Deployed the updated action from the current `master` workspace to the
  `clear-narwhal-936` Convex development deployment; Convex reported all
  functions ready. A direct deployed invocation with the stale one-segment
  model ID `gpt-5.6-sol` returned an empty endpoint list instead of throwing.

## Known limitation

The endpoint catalog remains provider-controlled, so an empty list means the
connected OpenRouter account currently has no available providers for that
model. An authenticated UI endpoint lookup still depends on a signed-in user's
connected OpenRouter credential.
