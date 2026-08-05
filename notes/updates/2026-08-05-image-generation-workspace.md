# Model-aware image generation workspace

## Summary

Implemented a dedicated Dev3 Image studio with model-aware settings, ordered
references, one-to-four native outputs, durable per-output state, and grouped
result actions. The existing image pipeline now stores generation sets, jobs,
and outputs with Library lineage while continuing to render legacy image
messages.

## User-visible behavior

- Provider, model, and OpenRouter host routing live in the image studio.
- Aspect ratio, resolution, count, format, quality, background, seed, style,
  and prompt enhancement appear only when supported by the selected model.
- Reference images can be ordered, removed, reused from completed outputs, or
  started from Library.
- Result sets show queued, generating, complete, partial, failed, and canceled
  states without estimated percentages.
- Completed outputs support preview, download, prompt copy, settings reuse, and
  use-as-reference. Failed or canceled sets can be retried.
- Mobile uses a compact settings disclosure and sticky Generate action; desktop
  uses a persistent 380-pixel control rail and scrollable results canvas.

## Affected areas

- Shared capability/config contract and validation
- Fal and OpenRouter image adapters
- Convex schema, generation actions, mutations, queries, cancellation, and
  Library lineage
- Attempt-owned execution claims, bounded provider responses, atomic terminal
  persistence, and conversation deletion cleanup
- Image workspace components, route integration, legacy fallback, and Library
  reference action
- Image progress presentation and focused automated coverage

## Validation

- TypeScript passed.
- Targeted image/provider/persistence/UI tests passed: 36 tests across 7 files.
- The default full suite passed 309 of 310 tests; the pre-existing
  `personalization-center` test exceeded its five-second timeout under the full
  parallel load and passed all 3 tests when rerun in isolation. The Library
  regression file also passed both tests in isolation.
- The full suite passed all 310 tests when rerun with a ten-second per-test
  timeout.
- Production client and SSR builds passed.
- Scoped ESLint passed.

## Limitations

- Authenticated visual browser QA was blocked because neither available browser
  surface had a signed-in localhost session. Automated component behavior,
  TypeScript, and production rendering were validated instead.
- The app intentionally supports raster PNG, JPEG, and WebP output only.
- The rollback flag restores the legacy client composer; additive backend tables
  remain deployed and do not require rollback.
