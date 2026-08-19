# OpenRouter file-reading reliability

## Outcome

- OpenRouter text generation now obtains the selected model's current
  `supported_parameters` from the server-side single-model endpoint. Models
  known to lack `tools`, and models whose metadata cannot be verified, receive a
  plain-text request without optional UI, terminal, web-search tools, or terminal
  sandbox instructions.
- The latest user attachment receives the inline-text budget before historical
  messages and project fallback sources, while the final conversation order is
  unchanged.
- OpenRouter's structured streamed errors and AI SDK `APICallError` instances are
  reduced to safe, actionable failure messages. A permission or guardrail 403 no
  longer marks the provider connection as unauthenticated.
- Catalog responses omit `inputModalities` when OpenRouter does not provide a
  valid string array, preventing unknown capability data from being presented as
  an authoritative empty list.
- The production deployment command now builds through `convex deploy --cmd`
  before publishing the resulting Cloudflare worker, preventing frontend/backend
  revision drift.

## Affected areas

- OpenRouter catalog parsing, tool-capability lookup, response generation, inline
  attachment ordering, and provider error classification
- Failed provider-response rendering
- Production deployment command and operator documentation

## Security and reliability

- Capability lookup uses the already-decrypted owner-scoped OpenRouter token on
  the backend, bounds the response body, validates the model ID, and fails closed
  to universally supported plain-text generation.
- Provider messages, response bodies, request payloads, and raw error metadata
  are neither logged nor persisted. Only allowlisted error types and coarse
  application messages are retained.
- Production deployment requires `CONVEX_DEPLOY_KEY`; the secret remains outside
  source control and the deploy stops before Cloudflare publication if Convex
  validation or publication fails.

## Validation

- `bunx vitest run convex/openRouterResponses.test.ts
convex/providerOAuth.test.ts`: passed (40 tests).
- `bun run test`: passed (358 tests across 76 files).
- `bun run typecheck`: passed.
- Scoped ESLint for the five changed TypeScript/TSX files: passed.
- Scoped Prettier check for all changed implementation, test, documentation, and
  configuration files: passed.
- `bun run build`: passed for both client and SSR bundles. The existing
  `chat-sidebar.test.tsx` route-export warning remains unchanged.
- `bunx convex deploy --help`: confirmed that `--cmd` runs before Convex
  typechecking, code generation, bundling, and publication, and that a failed
  step prevents later steps from running.
- A deployment dry-run was not run because `CONVEX_DEPLOY_KEY` is absent and the
  check must not select or access a production deployment implicitly.

The repository-wide `bun run check` and `bun run lint` remain red on unrelated
baseline files, including bundled `.agents/skills` templates, generated Convex
files, and existing application source. The files changed for this update pass
their scoped Prettier and ESLint checks.

## Known limitations

- Optional generative UI, terminal execution, and project-link web search are
  unavailable for OpenRouter models without tool calling. Plain-text chat and
  safely inlined text attachments remain available.
- Live provider generation was not exercised because no production credentials
  or user data were accessed.
