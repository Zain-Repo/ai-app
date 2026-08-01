# User message bubble colors

## Outcome

User preferences now include a named color selector for outgoing message
bubbles. The selected color is stored on the authenticated user's Convex
account and updates user-authored chat bubbles reactively without changing
assistant messages.

## Affected areas

- `src/components/user-preferences-dialog.tsx` provides a labeled native radio
  group with visible selection, keyboard focus, and fixed light/dark swatches.
- `src/lib/user-message-bubble-color.ts` owns the typed palette and safe
  fallback used by the dialog and chat renderer.
- `src/routes/chat.{-$slug}.tsx` applies the resolved preference only to user
  message bubbles.
- `convex/schema.ts` and `convex/users.ts` validate, default, read, and save the
  preference on the authenticated user document alongside the existing model,
  language, intelligence, and response-detail preferences.
- Focused frontend and Convex tests cover the complete dialog save payload,
  default and selected values, account isolation, and invalid color rejection.

## Validation

- `bun run test` passed: 39 test files and 165 tests.
- `bun run typecheck` passed.
- `bun run build` passed for client and SSR output with the existing route-test
  discovery warning.
- Scoped ESLint and Prettier checks passed for all feature files.
- Authored-path `git diff --check` passed.

## Limitations

- No authenticated visual browser session was performed.
- The Convex schema and functions were not deployed as part of this local
  implementation.
