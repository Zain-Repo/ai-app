# Desktop model effort discovery and compact UI density

The desktop chat model selector now exposes the reasoning-effort options
advertised by the Codex runtime, and the desktop workspace uses a slightly
smaller, tighter visual scale.

## Implementation

- Updated Codex `model/list` parsing to read the current
  `reasoningEffort` field while retaining compatibility with the legacy
  `effort` field.
- Preserved the runtime's advertised effort order and added end-to-end support
  for the current `ultra` level in renderer filtering, Electron IPC validation,
  and conversation persistence.
- Kept the existing model-specific behavior: the reasoning-effort submenu is
  shown only when the selected text model advertises supported effort levels.
- Reduced the desktop sidebar width, typography, avatar size, group spacing,
  and menu padding while retaining the existing navigation and interaction
  structure.
- Tightened the workspace header and applied antialiasing plus subtle sidebar
  separation and active-item depth for a cleaner overall desktop presentation.

## Affected areas

- `electron/main/codex-app-server.ts`: Codex model metadata parsing and the
  supported desktop reasoning-effort guard.
- `electron/main/index.ts`: desktop generation IPC validation.
- `src/routes/chat.{-$slug}.tsx`: reasoning-effort filtering, labels, and model
  selector settings.
- `convex/conversations.ts`: accepted reasoning efforts stored with desktop
  conversations and messages.
- `src/components/ui/sidebar.tsx`: compact sidebar dimensions, spacing, and
  typography.
- `src/components/sidebar-user-menu.tsx`: denser account control sizing.
- `src/styles.css`: global text rendering, workspace header density, and subtle
  sidebar state styling.
- `electron/main/codex-runtime.test.ts` and `convex/desktopCodex.test.ts`:
  protocol, IPC, and persistence regression coverage.

## Validation

- Focused model protocol and desktop conversation Vitest coverage passed: 2
  files and 8 tests.
- Focused sidebar UI Vitest coverage passed: 2 files and 10 tests.
- Scoped ESLint passed for the edited desktop UI files.
- Prettier checks passed for the edited TSX files.
- `bun run build` passed with only the existing route-test warning.
- `git diff --check` passed.

## Known limitation

- A live authenticated packaged desktop visual and end-to-end run was not
  exercised in this environment. Validation is limited to focused automated
  tests, scoped static checks, formatting, the production build, and diff
  checks.
