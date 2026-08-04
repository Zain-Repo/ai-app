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
  selected model endpoint documentation were checked on 2026-08-03 and
  refreshed for this model expansion.
- Focused Fal validation passed: 1 test file and 4 tests.
- The complete Vitest suite passed: 49 test files and 233 tests.
- TypeScript, targeted ESLint, and targeted Prettier checks passed.

## Known limitations

- No paid Fal generation or authenticated local visual QA was performed for
  the original or newly added endpoints. Queue, editing, catalog, pricing,
  storage, and URL-security behavior are covered with deterministic HTTP mocks;
  live availability and pricing remain dependent on each user's Fal account
  and current catalog response.
- The catalog intentionally exposes fourteen reviewed models rather than every
  Fal endpoint, including FLUX.2 Dev/Flex/Pro, FLUX Kontext Pro, Nano Banana
  2/Pro, GPT Image 1.5/2, Ideogram V3, Recraft V3, Seedream 4.5/V5 Pro, and
  Grok Imagine Image.
- This update adds no dependency, schema migration, or deployment.
