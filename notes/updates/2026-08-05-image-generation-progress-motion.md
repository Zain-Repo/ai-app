# Image generation progress motion — 2026-08-05

## Summary

The chat image-generation placeholder now communicates ongoing work with staged
status copy, an estimated linear progress indicator, a softly shifting exposure
wash, and a scan edge that reveals the placeholder from top to bottom. When the
generated image arrives, the image itself receives a final top-to-bottom reveal
instead of appearing abruptly.

## Implementation

- Added five generation-stage messages that advance during longer requests.
- Kept estimated progress below completion until the backend supplies an image.
- Reduced progress updates from every animation frame to four updates per second
  while Motion interpolates the visual state.
- Paused nonessential looping animation while the component is outside the
  viewport or the document is hidden.
- Preserved the full status and progress semantics for assistive technology and
  disabled transitions for reduced-motion users while retaining discrete
  progress updates.
- Extended the focused component test to cover startup, staged copy, completion,
  progress semantics, and preservation of the mounted preview.

## Affected areas

- `src/components/ui/image-generation.tsx`
- `src/components/ui/image-generation.test.tsx`

## Validation

- Focused Vitest: 2 tests passed.
- Full Vitest suite: 263 tests across 59 files passed.
- TypeScript type checking passed.
- Scoped ESLint and Prettier checks passed.
- Production client and SSR builds passed.
- Impeccable UI detector reported no findings.

## Limitations

- Progress is intentionally an elapsed-time estimate because the image providers
  do not expose granular generation progress. It stops at 94% until the backend
  returns the completed image.
- The production build continues to emit the existing TanStack Router warning
  for `src/routes/chat-sidebar.test.tsx` being located under `src/routes/`.
