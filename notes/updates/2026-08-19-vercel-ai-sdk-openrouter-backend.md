# Vercel AI SDK OpenRouter backend

## Outcome

Hosted OpenRouter chat, title, and embedding requests now share one strict
Vercel AI SDK provider factory using the requesting user's encrypted-at-rest,
server-decrypted OpenRouter credential. The existing OpenRouter model catalog,
provider routing, current-key credit status, image capability APIs, and
insufficient-credit handling remain intact.

Completed OpenRouter text responses now persist validated provider-reported
input, output, total, cached, and reasoning tokens when available. Multi-step
tool runs aggregate every AI SDK step, and billed cost is stored only when every
step includes OpenRouter's authoritative cost metadata. Missing or malformed
usage remains unavailable and cannot fail an otherwise completed response.

## Important design decisions

- OpenRouter remains the source of truth for models, key limits, and billed
  cost; Dev3 does not replace these with a local catalog or pricing estimate.
- Usage records are additive optional message metadata with explicit OpenRouter
  provenance, so existing and unsupported-provider messages remain compatible.
- The broader conversation totals, rolling summaries, and estimated-cost UI
  remain tracked by the existing per-response usage feature.

## Affected areas

- Shared OpenRouter AI SDK provider creation and usage parsing
- Convex hosted response completion and message schema
- OpenRouter title and embedding provider construction
- Usage aggregation and response persistence tests

## Validation

- Focused OpenRouter, catalog/billing, persistence, and usage tests passed: 43
  tests.
- Full Vitest suite passed with a 10-second timeout: 74 files and 334 tests.
- TypeScript type checking passed.
- Scoped ESLint and scoped Prettier checks passed.
- Production client and SSR build passed with the existing route-file warnings.
- `git diff --check` passed.

Repository-wide Prettier and ESLint commands still report pre-existing issues
in generated files, installed skill templates, and unrelated UI modules. No
repository-wide formatting or lint cleanup was included in this feature.

## Known limitations

- Existing messages are not backfilled.
- Usage summaries and a renderer for the detailed usage record remain outside
  this change.
- OpenAI and desktop subscription paths do not fabricate OpenRouter-equivalent
  billed cost.
