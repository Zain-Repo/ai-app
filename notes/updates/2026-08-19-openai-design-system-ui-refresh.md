# Reference-aligned chat workspace and design system refresh

Dev3 now uses the supplied calm AI-workspace reference as the visual foundation
for the authenticated chat shell and shared shadcn primitives. The update keeps
Dev3 branding and product behavior while adopting the reference's warm neutral
surfaces, wider navigation rail, quiet hierarchy, outline-icon language, and
bottom-anchored composer.

## Outcome

- Replaced the gray-purple interface accent with a restrained sage signal
  (`#4f8463`) over warm paper, pure-white content surfaces, deep ink text, and a
  compatible dark theme.
- Loaded Inter Variable locally and made it the display, heading, body, and
  label family.
- Updated the shared shadcn configuration to Lucide and aligned buttons, inputs,
  cards, dialogs, sidebar controls, focus rings, and radii with the reference.
- Expanded the desktop sidebar to 19.5rem, restored visible Dev3 branding,
  added prominent New chat and search controls, standardized sentence-case
  navigation, and improved the account footer.
- Simplified the main header, removed the empty-state starter cards, increased
  welcome-state breathing room, widened the composer, and added the model-error
  awareness note below it.
- Recorded product constraints in `PRODUCT.md` and the implemented visual
  system in `DESIGN.md` plus `.uizze/design.json`.

## Affected areas

- `src/styles.css`
- `components.json`
- `src/routes/chat.{-$slug}.tsx`
- `src/routes/__root.tsx`
- `src/components/ui/sidebar.tsx`
- `src/components/ui/button.tsx`
- `src/components/ui/input.tsx`
- `src/components/ui/dialog.tsx`
- `src/components/ui/card.tsx`
- `src/components/sidebar-workspace-switcher.tsx`
- `src/components/sidebar-user-menu.tsx`
- `src/components/ui/design-tokens.test.tsx`
- `src/routes/chat-sidebar.test.tsx`
- `PRODUCT.md`
- `DESIGN.md`
- `.uizze/design.json`

## Validation

- Focused sidebar, shared-token, account-menu, and chat-shell Vitest coverage
  passed: 4 files and 32 tests.
- TypeScript checking passed.
- Scoped ESLint passed for the edited TypeScript and TSX files.
- Production client and SSR builds passed with the existing
  `chat-sidebar.test.tsx` route-discovery warning.
- The broad Vitest run completed with 60 files passing and 14 failing (317 of
  334 tests passed). Sixteen failures hit the suite's 5-second timeout under
  parallel load; one unrelated image-workspace keyboard test failed its enabled
  state assertion. Directly affected tests pass in a single-worker run.
- The UI skill's bundled detector was unavailable. The companion local detector
  completed and reported one advisory for an existing decorative grid pattern
  outside the chat shell.

## Known limitation

Both available browser profiles redirect the local authenticated chat route to
Clerk sign-in. No authentication bypass was added, so desktop and mobile
implementation screenshots remain pending an authenticated visual-QA session.
The generated reference composition and source-level contract were used for the
fidelity pass, but they do not replace a rendered authenticated capture.

## Notion mirrors

- [Engineering note](https://app.notion.com/p/3c25615a45578117ac1fc0dfbb173250)
- [Completed Dev3 task](https://app.notion.com/p/3c25615a45578138a713e4ebfb346462)
