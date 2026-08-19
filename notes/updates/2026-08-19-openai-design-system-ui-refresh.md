# OpenAI design system UI refresh

Dev3 now uses a restrained OpenAI-aligned visual foundation across its public
landing surface, authentication screens, chat workspace, library, dialogs, and
shared controls.

## Outcome

- Replaced the previous blue-violet theme with the referenced muted purple-gray
  primary (`#8e8ea0`), neutral surfaces, readable dark body text, and a coherent
  dark theme.
- Switched interface typography to the system UI stack and restored a 16px body
  rhythm with 1.5 line height.
- Standardized the base radius to 5px, reduced decorative depth, and aligned
  interactive motion to the documented 400ms `ease` timing.
- Updated buttons, inputs, dialogs, cards, attachments, menus, bubbles, and
  workspace surfaces to use flat borders, consistent focus rings, and the same
  token language.
- Restyled the landing and authentication presentation without changing
  routing, provider behavior, or workspace interactions.

## Affected areas

- `src/styles.css`
- `src/components/ui/button.tsx`
- `src/components/ui/input.tsx`
- `src/components/ui/dialog.tsx`
- `src/components/auth-page.tsx`
- `src/components/library-workspace.tsx`
- `src/components/ui/design-tokens.test.tsx`

## Validation

- Full Vitest suite passed: 73 files and 324 tests.
- TypeScript checking passed.
- Production client and SSR build passed with the existing
  `chat-sidebar.test.tsx` route-discovery warning.
- Scoped ESLint passed for all edited TypeScript and TSX files.
- Scoped Prettier check and `git diff --check` passed.

## Known limitation

The repository-wide `npm run check` and `npm run lint` commands still report
pre-existing formatting and lint issues in generated files, bundled skill
templates, and unrelated UI modules outside this change. No broad formatting or
unrelated lint cleanup was included in this feature.
