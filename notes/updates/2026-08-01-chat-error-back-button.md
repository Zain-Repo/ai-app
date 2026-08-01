# Chat error recovery back button

## Outcome

The chat route error state now provides a visible `Back` button with a left-arrow icon. It returns to the previous browser history entry when available and opens a fresh chat when the app has no prior history entry.

## Affected area

- `src/routes/chat.{-$slug}.tsx`

## Validation

- Full Vitest suite passed: 33 test files and 136 tests.
- Route ESLint passed.
- TypeScript checking passed.
- Prettier check passed after formatting the route.
- `git diff --check` passed.

## Known limitation

Visual verification of the error state was not run in an authenticated browser session.
