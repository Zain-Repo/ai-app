# Sidebar conversation Show more

The Recent chats list and expanded Project chat lists now show the 10 most
recent matching conversations initially. Lists with additional loaded chats
show a `Show more` button that reveals the remainder without changing the
existing Convex query, search, routing, or chat actions.

## Affected areas

- `src/routes/chat.{-$slug}.tsx`
- `src/routes/chat-sidebar.test.tsx`

## Validation

- Focused sidebar tests passed.
- Full Vitest suite passed.
- TypeScript type checking passed.
- Scoped ESLint and Prettier checks passed.
- Production client and SSR build passed with the existing route-file and
  bundle-size warnings.
- `git diff --check` passed.

## Limitations

The button reveals the remainder of the existing 30-chat query result. Backend
pagination was intentionally left unchanged.
