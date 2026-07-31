# Automatic updates and chat workspace refresh

## Outcome

AI Harness now schedules automatic desktop update checks without changing the
existing manual update flow, and the signed-in chat workspace has a more
intentional desktop-app presentation. No release was published as part of this
work.

## Automatic desktop update checks

- The updater persists its launch count and most recent check timestamp in the
  app user-data directory.
- On a first launch, the first automatic check runs after 15 minutes. On later
  launches it runs no sooner than two minutes and remains subject to a six-hour
  cooldown. Successful scheduling then continues at a 15-minute interval.
- Automatic checks are single-flight, so an interval cannot overlap a still
  running check.
- Scheduling applies only to packaged, non-Microsoft Store builds. Timers stop
  when the main window closes and when the application begins shutting down.

## Signed-in chat workspace refresh

- The chat shell uses the existing semantic color tokens for layered workspace
  depth, a contextual two-level header, and a restrained composer dock.
- The message column has more deliberate desktop and narrow-width spacing.
- Empty and loading states now orient the user, provide a clear next step, and
  announce non-urgent status updates accessibly.
- The shared composer exposes a stable data-slot hook so its visual treatment
  remains scoped to the chat workspace rather than changing component behavior.

## Affected files

- `electron/main/index.ts`
- `electron/main/updater.ts`
- `electron/main/updater-schedule.ts`
- `electron/main/updater-schedule.test.ts`
- `src/routes/chat.{-$slug}.tsx`
- `src/components/ui/ai-input.tsx`
- `src/styles.css`
- `notes/updates/2026-07-31-automatic-updates-and-chat-workspace-refresh.md`

## Validation

- `bun run typecheck`
- Targeted ESLint
- Focused Vitest suite: 5 files, 19 tests
- `bun run build`
- `git diff --check`

## Limitations

- The authenticated desktop chat workspace still needs manual visual
  verification.
- The automatic updater runtime still needs validation with a packaged NSIS
  build and published GitHub release assets.
- No release was published.
