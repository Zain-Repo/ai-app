# Chat availability during backend skew

## Outcome

Chat no longer falls through to the route-level `Chat unavailable` screen when
an optional memory query is missing or temporarily unavailable. Personalization
is mounted only when opened, its failure stays inside an actionable dialog, and
per-response memory attribution fails closed without replacing the conversation.

## Root cause

The Agent Memory v2 client mounted `PersonalizationCenter` for every chat even
while its dialog was closed. That immediately called the newly added
`memories.getPersonalization` Convex query. A frontend/backend deployment mismatch
or backend failure escaped to the route error boundary and replaced the entire
chat workspace. Completed assistant messages had the same risk through
`memories.listResponseSources`.

Convex history confirmed the mismatch: the authenticated renderer first
received `Could not find public function for 'memories:getPersonalization'`.
After the current backend functions deployed, the same query completed
successfully.

## Affected areas

- `src/routes/chat.{-$slug}.tsx`
- `src/routes/chat-sidebar.test.tsx`
- Local Convex development selection in gitignored `.env.local`

## Validation

- Focused chat route tests: 10 passed.
- Full Vitest suite: 47 files and 223 tests passed.
- TypeScript, scoped ESLint, scoped Prettier, production client/SSR build, and
  `git diff --check` passed.
- Convex functions reached ready state on the existing cloud development
  deployment `clear-narwhal-936`.
- The local Vite renderer listened on `127.0.0.1:3000`, and the Electron main,
  renderer, GPU, and utility processes remained running.

## Limitation

No production Convex deployment, Cloudflare deployment, desktop release, or Git
push was performed. The fix must pass the repository review and deployment flow
before the installed production client receives it.
