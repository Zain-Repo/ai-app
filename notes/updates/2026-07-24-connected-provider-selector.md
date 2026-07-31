# Composer provider selector and sidebar refresh

## Outcome

Provider selection now lives in the composer beside attachments, where it is
used together with the model menu. The selector derives its options from the
user's connected provider records. Desktop users can select ChatGPT
subscription, Cursor Agent, OpenAI, or OpenRouter when each is connected; web
users see only providers available outside the desktop application. The
automatic default continues to prefer a provider with chat support before
Cursor.

The redundant provider control was removed from the sidebar. The sidebar now
uses quieter surfaces, clearer active rows, tighter project and recent-chat
grouping, and a consolidated account menu for profile, updates, archives,
memory, preferences, appearance, and sign-out actions.

The composer provider menu supports arrow, Home, End, Enter, Space, Escape, and
focus restoration. It remains available when the current provider cannot load
models so the user can recover by selecting another connection, while existing
conversations still lock provider switching.

Cursor Agent selection deliberately leaves the composer disabled with a clear
availability message. The selector exposes the connected Cursor integration,
but Cursor response execution and model discovery are not implemented yet.

## Affected area

- `src/routes/chat.{-$slug}.tsx`
- `src/routes/chat-sidebar.test.tsx`
- `src/components/ui/ai-input.tsx`
- `src/components/ui/ai-input.test.tsx`
- `src/components/sidebar-user-menu.tsx`
- `src/components/sidebar-user-menu.test.tsx`

## Validation

- The complete Vitest suite passed: 29 files and 95 tests.
- TypeScript checking and the production client/SSR build passed.
- Scoped ESLint, Prettier, and `git diff --check` passed.

## Known limitation

Cursor remains a connection-only desktop integration. Executing Cursor
responses and listing Cursor models are out of scope for this change.
