# Settings dialog sidebar navigation

The Settings dialog now uses a stable two-pane layout inspired by desktop
settings applications. General, Saved memory, History, and Processing are
available from an independently scrollable navigation rail, while the active
section renders in its own independently scrollable content pane.

## Implementation

- Added section icons, active-row treatment, panel titles, and concise section
  descriptions without changing the existing settings actions or data flow.
- Moved the close action into the navigation rail so it remains visible above
  long settings content.
- Collapsed the rail to accessible icon-only navigation below the small-screen
  breakpoint, preserving space for the active panel.
- Forwarded the tabs orientation to the Base UI primitive so vertical arrow-key
  navigation and accessibility metadata match the visual layout.

## Affected areas

- `src/components/personalization-center.tsx`
- `src/components/personalization-center.test.tsx`
- `src/components/ui/tabs.tsx`

## Validation

- Focused Personalization Center Vitest suite: 3 tests passed.
- TypeScript type checking passed.
- Production client and SSR build passed. The build emitted the existing
  non-route warning for `src/routes/chat-sidebar.test.tsx`.
- Scoped ESLint, Prettier, and `git diff --check` passed.
- Authenticated Chrome smoke checks confirmed the dialog, all four section
  tabs, visible rail close action, and responsive layout at the default desktop
  viewport and at 520 by 760 pixels.

## Limitations

This update reorganizes the existing Settings sections only. It does not add
new preference categories or change persistence, provider, or memory behavior.

## Compact density refinement — 2026-08-05

- Reduced the desktop dialog cap from `max-w-5xl` by 46rem to `max-w-4xl` by
  40rem while retaining the viewport-aware height limit and independently
  scrollable content panels.
- Narrowed the desktop navigation rail, tightened panel padding and section
  rhythm, and reduced the close action and General-panel select/button heights.
- Applied the existing semantic label type role to navigation, field labels,
  selects, buttons, and message-color choices. Section headings now use a
  lighter Raleway weight and restrained tracking.
- Reduced message-color rows and swatches without changing radio semantics,
  focus visibility, disabled states, or preference persistence.

### Refinement validation

- Focused Personalization Center Vitest suite: 3 tests passed.
- TypeScript type checking passed.
- Scoped ESLint and Prettier checks passed.
- The Impeccable UI detector reported no findings for the changed component.

No authenticated browser smoke test was run for this focused refinement.
Existing interaction coverage and explicit compact-shell regression assertions
cover the changed settings component.
