# Fal image provider

## Outcome

Fal is available as a first-class, image-only provider. Users can verify and
store an encrypted Fal API key, browse a curated live model catalog with current
pricing, select Fal in image mode, and generate or edit images through Fal's
asynchronous queue API.

## Affected areas

- `convex/fal.ts`: implements authenticated catalog and pricing discovery,
  curated endpoint and edit-schema mapping, bounded queue polling, trusted URL
  validation, and bounded JPEG/PNG/WebP downloads.
- `convex/providerConnections.ts` and `convex/providerOAuth.ts`: add encrypted
  Fal credentials, live key verification, model listing, and expired-key state.
- `convex/conversations.ts` and `convex/openRouterResponses.ts`: route only
  image conversations to Fal, preserve image attachments as edit references,
  persist generated files, and report authorization or credit failures.
- `src/components/provider-connect-dialog.tsx` and
  `src/routes/chat.{-$slug}.tsx`: add the provider connection form, output-mode
  filtering, curated model priority, and provider-specific failure guidance.

## Evidence

- Fal's official queue, platform authentication, model catalog, pricing, and
  selected model endpoint documentation were checked on 2026-08-03.
- Focused validation passed: 8 test files and 67 tests.
- The complete Vitest suite passed: 112 suites and 232 tests.
- TypeScript, targeted ESLint, the production client/SSR build, and
  `git diff --check` passed. The build retained the existing
  `chat-sidebar.test.tsx` route-file and chunk-size warnings.

## Known limitations

- No paid Fal generation or authenticated local visual QA was performed. Queue,
  editing, catalog, pricing, storage, and URL-security behavior are covered with
  deterministic HTTP mocks.
- The catalog intentionally exposes five reviewed models rather than every Fal
  endpoint: FLUX.2 Klein 4B, FLUX.2 Pro, Nano Banana 2, Recraft V3, and Seedream
  V5 Pro.
- This update adds no dependency, schema migration, or deployment.
