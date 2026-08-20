# OpenRouter file upload compatibility

## Outcome

OpenRouter chat uploads now follow the selected model's advertised input
modalities in both the composer and the trusted backend. Markdown and other
explicitly text-based formats are safely inlined even when the browser reports
an empty or generic MIME type. Private image, PDF, audio, video, and supported
binary uploads are read from authorized Convex storage and sent through the
canonical AI SDK 7 file-part structure, so OpenRouter never needs to fetch a
local or private application URL.

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
- Added backend modality validation for the complete message history, including
  retries, model switches, and project fallback attachments. Audio and video
  inputs are matched to their dedicated model modalities.
- Replaced deprecated AI SDK image parts and legacy URL fields with canonical
  AI SDK 7 `file` parts using tagged `data` or `url` content.
- Loaded private OpenRouter attachment bytes sequentially with a 40 MiB
  aggregate request budget. Historical text reads stop after the 500,000
  character inline budget is exhausted.
- Reused one bounded OpenRouter model-metadata request for both attachment
  modalities and tool support, while preserving authentication, rate-limit,
  and provider failure statuses.
- Preserved the existing URL transport for direct OpenAI requests and omitted
  empty text parts from file-only messages.
- Updated `ai` to 7.0.70 and `@ai-sdk/openai` to 4.0.44 while retaining the
  current `@openrouter/ai-sdk-provider` 3.0.0 integration.

## Validation

- Targeted attachment/provider suite: 58 tests passed across three files.
- Full suite: 369 tests passed across 76 files with one worker. The normal
  parallel run hit three unrelated 5-second timeouts; each also passed when
  rerun individually.
- `bun run typecheck` passed.
- `bun run build` passed with the existing route-file warning for
  `src/routes/chat-sidebar.test.tsx`.
- Targeted Prettier and ESLint checks passed. Repository-wide ESLint remains
  blocked by existing `.agents` template, generated-file, and UI lint errors.
- Independent read-only review returned `ship` with no actionable findings.

## Known limitations

- Capability validation depends on OpenRouter's current single-model metadata.
  If attachment modalities cannot be verified, the backend returns a safe,
  actionable error instead of guessing or sending an incompatible request.
- No paid or credentialed OpenRouter generation request was made.
