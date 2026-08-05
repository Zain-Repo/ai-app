# Sidebar mode controls at the top

The chat sidebar now places the text/image output selector and voice action in a compact top header row modeled on the supplied Codex references. The selector uses a descriptive radio menu with a visible selected state, keyboard-accessible menu behavior, and the existing chat/send disabled state. Image mode remains hidden when no connected image provider is available.

The large logo block was removed to give the navigation a quieter top edge, and the New chat action now uses the same restrained sidebar-navigation treatment. The account menu remains anchored at the bottom. The per-conversation memory selector also remains in the footer because it is a separate chat-specific setting and was not part of the referenced controls.

## Compact sizing follow-up

Reduced the closed mode selector to a 32-pixel compact control with smaller type,
icon, radius, and spacing. The open menu is now 256 pixels wide with tighter
padding and 44-pixel option rows, preserving the descriptions and usable target
sizes while removing excess visual weight.

## Affected areas

- `src/components/sidebar-mode-controls.tsx`
- `src/components/sidebar-mode-controls.test.tsx`
- `src/routes/chat.{-$slug}.tsx`
- `design-qa.md`

## Validation

- TypeScript passed with `tsc --noEmit`.
- In a clean feature worktree, all 241 Vitest tests across 52 files passed.
- The production client and SSR build passed.
- Scoped ESLint and Prettier passed for the changed TypeScript and TSX files.
- `git diff --check` passed.
- Compact sizing follow-up: all 261 Vitest tests across 59 files, TypeScript,
  scoped ESLint and Prettier, and the production client/SSR build passed. The
  build retained the existing warning that `src/routes/chat-sidebar.test.tsx`
  is not a route.
- The compact sizing follow-up was mirrored to the Dev3 Engineering Notes page.

## Limitations

- Browser design QA is blocked: both the in-app browser and Chrome redirect the local chat route to Clerk sign-in, so an authenticated sidebar screenshot could not be captured or compared with the references. `design-qa.md` records the blocked fidelity surfaces and required follow-up.
- Repository-wide ESLint remains blocked by pre-existing `.agents` template/parser configuration issues, generated JavaScript coverage, and unrelated UI lint findings. The changed files pass scoped lint.
