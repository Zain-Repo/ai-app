# OpenRouter file upload compatibility

## Outcome

OpenRouter chat uploads now follow the selected model's advertised input
modalities before a draft file is uploaded or a message is persisted. Markdown
and other explicitly text-based formats are inlined even when the browser
reports an empty or generic MIME type, PDFs use OpenRouter's universal
file-parser plugin, and unsupported image or binary inputs produce a specific
composer error.

## Implementation

- Added a shared attachment classifier that gives explicit MIME metadata
  precedence and uses a conservative filename allowlist only for missing or
  `application/octet-stream` metadata.
- Added strict UTF-8 and binary-content checks before extension-identified text
  is uploaded and repeated the same check before server-side inlining.
- Preserved OpenRouter catalog `input_modalities` for the composer and rejected
  images without `image` input and unknown binaries without `file` input.
- Normalized extension-identified PDF and raster-image media types before AI SDK
  prompt conversion.
- Kept PDFs available to every OpenRouter text model through OpenRouter's
  native-first `file-parser` behavior and automatic parsing fallback.

## Validation

- `bunx vitest run convex/openRouterAttachments.test.ts convex/openRouterResponses.test.ts convex/providerOAuth.test.ts` — 39 tests passed.
- `bun run test` — 350 tests passed across 76 files after merging the latest
  `master`.
- `bun run typecheck` — passed.
- `bun run build` — passed with the existing route-file warning for
  `src/routes/chat-sidebar.test.tsx`.
- Targeted Prettier and ESLint checks — passed.
- `git diff --check` — passed.

## Known limitations

- Capability validation depends on the current OpenRouter catalog. If an older
  response omits input modalities, the client permits the upload and leaves the
  provider as the final compatibility boundary instead of blocking all files.
- No paid or credentialed OpenRouter generation request was made.
