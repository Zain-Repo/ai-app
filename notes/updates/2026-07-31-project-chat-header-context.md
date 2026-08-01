# Project context in chat headers

## Outcome

Project chats now identify their active project in the workspace header with a
folder icon and `Project: <name>` label while keeping the conversation title as
the primary heading. New chats opened inside a project receive the same label;
ordinary chats keep the existing `AI workspace` header.

Existing chats use their stored project membership, while project workspace
routes stay keyed to the requested project. The active project is loaded
directly, so the header still works when that project falls outside the
sidebar's capped project list.

## Affected area

- `src/routes/chat.{-$slug}.tsx`
- `src/routes/chat-sidebar.test.tsx`
- `convex/projects.ts`
- `convex/projects.test.ts`

## Validation

- Focused project and chat route tests passed: 16 tests.
- TypeScript checking and the production client/SSR build passed.
- Scoped ESLint and Prettier checks passed.
- `git diff --check` passed.

## Known limitation

Authenticated visual verification was blocked because the production Clerk
configuration rejects the localhost origin. The local app redirected to the
sign-in route as expected.
