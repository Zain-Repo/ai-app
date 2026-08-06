# Project Sources ledger redesign

## Outcome

The Project Sources screen now follows the selected OpenAI-style reference with
a left-aligned workspace, compact semantic-search configuration strip, line
tabs, restrained primary actions, and a responsive source ledger. The ledger
organizes source metadata, processing stages, readiness, and actions into
stable columns instead of separate attachment cards.

## Affected areas

- `src/components/project-sources-panel.tsx`
- `src/components/project-sources-panel.test.tsx`
- `src/routes/chat.{-$slug}.tsx`
- `design-qa.md`
- Project Sources visual comparison artifacts in the repository root

## Preserved behavior

- Existing provider switching, retry, remove confirmation, loading, empty,
  failure, and accessible row-selection behavior remains connected to the
  original handlers.
- Searchable-source totals continue to derive from current data. The four-row
  verified state therefore reports four searchable sources instead of copying
  the reference image's inconsistent six-source label.
- Narrow viewports use an internal table overflow region without introducing
  document-level horizontal overflow.

## Validation

- Project Sources component suite: 11 tests passed.
- Full Vitest suite: 73 files and 324 tests passed.
- TypeScript type checking passed.
- Focused ESLint and Prettier checks passed.
- Production client and SSR build passed with the existing non-route warning
  for `src/routes/chat-sidebar.test.tsx`.
- Browser checks covered tab switching, row selection, remove confirmation
  cancellation, action availability, a normalized 1917 × 992 visual
  comparison, and responsive overflow at 1280 pixels.
- Fresh final browser state reported no console errors.
- Design QA found no unresolved P0, P1, or P2 issues.

## Limitations

The local browser could not enter the Clerk-authenticated application shell.
Visual QA therefore rendered the real Project workspace and Project Sources
components through a temporary local harness; the unchanged sidebar shell was
excluded from design findings. No branch, commit, push, pull request, or
deployment was created.
