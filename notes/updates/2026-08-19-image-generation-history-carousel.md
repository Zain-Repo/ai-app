# Image generation history carousel

## Summary

The Image workspace now replaces the static Recent / Variations placeholders
with the authenticated user's generated images from Convex storage. The
carousel loads bounded pages as the user approaches the end, allowing the
complete stored history to remain reachable without an unbounded database read.

## User-visible behavior

- Recent generated images appear newest first across image conversations.
- The first eight generated-image Library assets load initially; another eight
  are requested near the final loaded slide until pagination is exhausted.
- Responsive slide widths, previous/next controls, touch dragging, and existing
  carousel keyboard navigation keep the strip usable across viewport sizes.
- Selecting a thumbnail opens a larger contained preview.
- Loading, empty, and unavailable signed-URL states render intentionally instead
  of displaying permanent placeholders or browser broken-image indicators.

## Reliability and security

- The carousel reuses `api.library.list`, which derives the authenticated user
  server-side, filters with the owner/category/creation-time index, orders
  newest first, and resolves authorized Convex storage URLs.
- Database access remains cursor-paginated and bounded to eight items per load.
- No schema, persistence, or provider-execution changes were required.
- Duplicate load requests for the same result count are suppressed while a page
  transition is in progress.

## Affected areas

- `src/components/image-workspace/recent-generations-carousel.tsx`
- `src/components/image-workspace/recent-generations-carousel.test.tsx`
- `src/components/image-workspace/image-workspace.tsx`
- `src/components/image-workspace/image-workspace.test.tsx`

## Validation

- Focused Image workspace tests passed: 6 tests across 2 files.
- Full Vitest suite passed with a ten-second per-test timeout: 329 tests across
  74 files. The default five-second run timed out only in the unrelated
  Personalization Center suite; that suite passed all 3 tests with the same
  ten-second timeout.
- TypeScript type checking passed.
- Scoped ESLint and Prettier checks passed.
- Production client and SSR builds passed.
- `git diff --check` passed.

The production build emitted the existing non-route warning for
`src/routes/chat-sidebar.test.tsx`.

## Limitation

The local app preview loaded successfully, but neither available browser
session was authenticated. The protected Image workspace therefore could not be
visually smoke-tested without a user sign-in. Responsive rendering, pagination,
preview, and unavailable-image behavior remain covered by focused component
tests.
