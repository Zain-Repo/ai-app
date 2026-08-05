# Dev3 Chat and Dev3 Image workspace switcher

The shared Dev3 sidebar now has two explicit workspaces: Dev3 Chat for text
conversations and Dev3 Image for image-generation threads. The compact,
keyboard-accessible switcher replaces the previous output-mode selector.
Switching workspaces returns to a clean workspace home, while Projects and
Library remain shared navigation surfaces.

Conversation history is separated by stored output mode across recent,
project, and archived views. Legacy conversations without an output mode are
treated as Chat conversations. Direct links and conversations opened from
Library or Archived are canonicalized to their stored workspace. Dev3 Image is
always discoverable; when no image provider is connected, its home explains
the requirement and opens the existing provider connection flow.

## Affected areas

- Workspace routing, sidebar navigation, generation setup, and archived views
  in `src/routes/chat.{-$slug}.tsx` and the related components.
- Workspace history filtering through existing deployed indexes, with staged
  compound indexes backfilling for a later query-activation deploy, in
  `convex/conversations.ts` and `convex/schema.ts`.
- Component, route, archive, and Convex behavior tests.

## Validation

- All 272 Vitest tests across 60 files passed with a 10-second harness timeout.
  The default 5-second full-suite run timed out in the unrelated
  `personalization-center` test; that test passes alone in 6 seconds.
- TypeScript checking and scoped ESLint passed.
- Scoped Prettier and `git diff --check` passed.
- The production client and SSR build passed with the existing warning that
  `src/routes/chat-sidebar.test.tsx` is not a route.
- Fallow changed-branch audit passed before commit.

## Limitations

- Authenticated visual QA could not run in the local browser environment. Both
  available browser surfaces blocked the local URL, and the isolated worktree
  intentionally does not copy the private `.env.local` required to start the
  authenticated Convex-backed route.
- This change reuses the existing image-generation thread experience. A
  gallery landing page, editor canvas, and image version graph remain outside
  this feature.
- The new compound indexes remain staged in this deploy. A separate follow-up
  must activate and query them only after all three Convex backfills complete.

## Review follow-up

- Kept per-conversation memory controls available in both Dev3 Chat and Dev3
  Image so image prompts can opt out of memory reads and writes.
- Removed the same-deploy dependency on newly added Convex indexes; the feature
  now uses already-deployed indexes until the staged backfills complete.
