# Sidebar agent-working loader

Sidebar conversation rows now show a compact trailing spinner while the latest
assistant response in that conversation is pending or streaming. The indicator
uses the shared spinner component, preserves the existing title truncation and
chat-action spacing, exposes a conversation-specific status label, and stops
rotating when reduced motion is requested.

The bounded `listWorkspaceRecent` query now enriches each returned conversation
with a reactive `isGenerating` flag by reading the active branch's last message.
This avoids a schema migration and keeps the loader accurate when a response is
running in a conversation other than the currently open chat. The client also
uses its local generation state as an immediate fallback for the selected chat.

## Affected areas

- `convex/conversations.ts`
- `convex/projects.test.ts`
- `src/routes/chat.{-$slug}.tsx`
- `src/routes/chat-sidebar.test.tsx`

## Validation

- Focused Convex and sidebar Vitest coverage passed: 2 files and 33 tests.
- TypeScript type checking passed.
- ESLint passed for all changed TypeScript files.
- Prettier verification passed for all changed TypeScript files.
- The production Vite client and server build passed. It retained the existing
  warning that `src/routes/chat-sidebar.test.tsx` is not included in the route
  tree.
- The full Vitest run passed 325 of 326 tests. One unrelated personalization
  test exceeded its 5-second timeout under full-suite load; its file passed 3 of
  3 tests when rerun in isolation.

## Known limitations

- Authenticated visual QA was not run. Automated coverage verifies the visible
  loader state, accessible status name, and reduced-motion class.
