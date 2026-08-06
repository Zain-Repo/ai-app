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
- The workspace now keeps its loading state during the single render between
  capability resolution and draft-default initialization, preventing the chat
  route from falling through to the unavailable error screen.

## Follow-up correction

The capability action could resolve one render before the draft hook populated
its default configuration. The workspace treated capability availability as
sufficient to render settings and force-read the still-null configuration. It
now renders settings only when both values are ready and otherwise preserves the
loading state. A component regression test covers this timing transition.

## Affected areas

- Shared capability/config contract and validation
- Fal and OpenRouter image adapters
- Capability coverage for all 24 curated Fal image models, including the ten
  models added by the upstream catalog work
- Convex schema, generation actions, mutations, queries, cancellation, and
  Library lineage
- Attempt-owned execution claims, bounded provider responses, atomic terminal
  persistence, and conversation deletion cleanup
- Image workspace components, route integration, legacy fallback, and Library
  reference action
- Image progress presentation and focused automated coverage
- Image workspace capability/config readiness guard and regression coverage

## Validation

- TypeScript passed.
- Targeted image/provider/persistence/UI tests passed: 36 tests across 7 files.
- After integration with the chat-controls and expanded Fal catalog branch, the
  full suite passed all 319 tests across 71 files with a ten-second per-test
  timeout.
- Production client and SSR builds passed.
- Scoped ESLint passed.
- Follow-up validation passed all 320 tests across 72 files, TypeScript,
  production client and SSR builds, scoped ESLint and Prettier, and Git diff
  whitespace checks.
- Authenticated Electron reproduction no longer emitted the null-config
  `dimension` exception after the workspace reloaded with the correction.

## Limitations

- The authenticated Electron smoke test covered workspace loading and error
  containment, but did not complete a billable image generation because the
  selected backend model was reported as unavailable.
- The app intentionally supports raster PNG, JPEG, and WebP output only.
- The rollback flag restores the legacy client composer; additive backend tables
  remain deployed and do not require rollback.
