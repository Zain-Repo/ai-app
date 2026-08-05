# Interface typography and compact control refresh

The application interface now uses a cleaner Inter-based body type system,
restrained Raleway headings, and more compact control dimensions while
preserving existing behavior, dark-theme semantics, and cinematic
landing-page display headings.

## Implementation

- Replaced Outfit with self-hosted Inter for application body text. Raleway is
  used selectively for compact interface headings and cinematic display text.
- Added semantic typography roles, now tuned to 13/18px small text, 15/19px
  titles, 12.5/16px labels, and 13.5/20px body text.
- Updated light-theme default text to the requested `#333333` equivalent and
  subtle text to the visually equivalent, WCAG AA-safe `#767676`. Existing
  dark-theme foreground tokens remain unchanged.
- Kept default buttons at 32px high, reduced their radius to 10px, removed the
  broad `transition-all`, and added restrained 0.96 press feedback that is
  disabled under reduced motion.
- Added a 20px-high, 6px-radius success badge using the requested `#CAFACE`
  fill. The requested `#15B042` is retained as the accent edge; the text uses a
  darker green because the original text/fill pair measured only 2.47:1.
- Reduced the standard settings switch to a 24x14px track with a 10px thumb
  and the requested `#0077E6` checked color while retaining a centered 40x40px
  interaction target.
- Standardized shared data-table rows at 40px and applied the success badge to
  completed source-indexing and desktop-update states.

## Affected areas

- `src/styles.css`: fonts, semantic type roles, light neutral text, success
  colors, and switch color tokens.
- `src/components/ui/`: shared buttons, badges, switches, tables, labels, and
  title primitives.
- `src/components/project-sources-panel.tsx` and
  `src/components/desktop-updater.tsx`: success-state badge adoption.
- `src/components/ui/design-tokens.test.tsx`: focused dimension and role
  regression coverage.
- `package.json` and `bun.lock`: self-hosted Inter dependency.

## Validation

- All 243 Vitest tests across 53 files passed; the focused UI and status
  coverage accounted for 15 tests across 3 files.
- TypeScript type checking passed.
- Scoped ESLint and Prettier checks passed for the edited UI files.
- The production client and SSR build passed with only the existing
  `chat-sidebar.test.tsx` route-discovery warning.
- In-app browser verification confirmed Inter at 14/20px, the expected light
  and dark tokens, preserved Raleway display headings, successful theme
  switching, and no console errors.
- `git diff --check` passed before documentation was added.

## Known limitation

The signed-in chat workspace was not available for live visual inspection in
this environment. Shared primitive behavior is covered by focused component
tests, and the public landing and sign-in surfaces were exercised in both
light and dark themes where applicable.

## Compact workspace density follow-up

The chat workspace and its supporting overlays received a second density pass
so more content fits comfortably without making controls feel cramped.

- Reduced the shared small, title, label, and body typography roles and paired
  Inter body copy with restrained semibold Raleway headings.
- Tightened shared dialogs, alert dialogs, sheets, drawers, tabs, empty states,
  and sidebar widths, spacing, corner radii, and control heights.
- Reduced chat header, message-stream, composer, markdown, project-workspace,
  and user-message spacing. User messages now render with one visual surface
  instead of a nested double bubble.
- Compacted the settings navigation, provider connection flow, archived-chat
  dialog, memory dialog, and user-preferences dialog.
- Preserved 16px mobile composer input text to avoid iOS focus zoom, keyboard
  navigation and focus styling, semantic labels, and reduced-motion behavior.

### Follow-up validation

- All 261 Vitest tests across 59 files passed.
- TypeScript type checking and scoped ESLint passed.
- The production client and SSR build passed with only the existing
  `chat-sidebar.test.tsx` route-discovery warning.
- The public landing and Clerk sign-in surfaces rendered without a Vite error
  overlay during browser smoke testing. Authenticated chat surfaces remained
  unavailable because the chat route redirected to sign-in.
- `git diff --check` passed after the focused diff review.
