# Iconiq project context and thinking states

## Outcome

AI Harness now uses the configured `@iconiq` registry for two locally owned UI
components: `thinking-indicator` and `setup-checklist`. Pending assistant
responses use the Iconiq thinking indicator, while project creation presents a
derived Project context checklist that guides users to the name, instructions,
and optional sources fields.

## Affected areas

- `src/components/ui/thinking-indicator.tsx`: installed from
  `@iconiq/thinking-indicator`; it replaces the pending or empty-stream response
  spinner while preserving a single accessible status and reduced-motion
  behavior.
- `src/components/ui/setup-checklist.tsx`: installed from
  `@iconiq/setup-checklist` as an editable local component.
- `src/components/project-context-progress.tsx`: derives context progress from
  project name, instructions, and source count. Checklist actions focus the
  name field or switch to and focus the instructions or sources tab. It does
  not persist checklist state or add backend dependencies.
- `src/lib/project-context-progress.ts` and
  `src/lib/project-context-progress.test.tsx`: contain and test the pure
  derived-progress logic.
- `src/routes/chat.{-$slug}.tsx`: resets the project-creation tab after a
  successful project creation and integrates both components into the existing
  chat and project-creation flows.

## Validation

- Full Vitest suite passed: 36 files and 157 tests.
- TypeScript type checking passed.
- Production client and SSR builds passed.
- Scoped ESLint and focused Prettier checks passed.
- Authored-path `git diff --check` passed.

## Limitations

- No authenticated visual browser verification was performed.
- Repository-wide lint remains blocked by pre-existing errors in
  `.agents/`, `.worktrees/`, generated files, and existing UI code; validation
  was scoped to the authored paths.
