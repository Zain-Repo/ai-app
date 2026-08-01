# Project context in chat headers

## Outcome

Project chats now identify their active project in the workspace header with a
folder icon and `Project: <name>` label while keeping the conversation title as
the primary heading. New chats opened inside a project receive the same label;
ordinary chats keep the existing `AI workspace` header.

Loaded conversation data is authoritative for project membership, so direct
links and stale project query parameters cannot leave the header showing the
wrong project.

## Affected area

- `src/routes/chat.{-$slug}.tsx`
- `src/routes/chat-sidebar.test.tsx`

## Validation

- Focused project chat and sidebar tests passed: 8 tests.
- TypeScript checking and the production client/SSR build passed.
- Scoped ESLint and Prettier checks passed.
- `git diff --check` passed.

## Known limitation

Authenticated visual verification was blocked because the production Clerk
configuration rejects the localhost origin. The local app redirected to the
sign-in route as expected.
