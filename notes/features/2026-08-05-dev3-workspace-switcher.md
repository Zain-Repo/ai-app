# Dev3 Chat and Dev3 Image workspaces

## Feature statement

Add a compact product switcher to the shared Dev3 sidebar so users can move
between a text-focused Dev3 Chat workspace and an image-generation-focused
Dev3 Image workspace. Projects and Library remain shared, while conversation
history and workspace controls follow the selected product.

## Implementation plan

- Add a typed `workspace=chat|image` route search value and use Chat as the
  backwards-compatible default.
- Replace the current logo and output selector with an accessible workspace
  dropdown based on the supplied reference.
- Derive new-conversation output mode from the active workspace and filter
  recent, project, and archived conversations on the backend.
- Treat legacy conversations without an output mode as Chat conversations.
- Keep Dev3 Image discoverable without a connected image provider and provide
  a clear connection state without hiding existing image threads.
- Preserve shared Projects and Library navigation and canonicalize direct
  conversation links to the conversation's stored workspace.

## Acceptance criteria

- Both workspace options are visible and keyboard accessible.
- Switching products opens a clean workspace home and clears incompatible
  conversation, project, library, and message state.
- Chat and Image histories remain separate in recent, project, and archived
  conversation views.
- Chat retains voice and text-capable providers; Image uses only image-capable
  providers and generation models.
- Legacy conversations with no stored output mode appear in Dev3 Chat.
- Users without an image provider can enter Dev3 Image, understand what is
  required, and open the existing provider connection flow.

## Security and reliability constraints

- Preserve server-side ownership checks for users, projects, and conversations.
- Keep recent-conversation queries bounded and index-backed.
- Do not rewrite or delete existing conversations during rollout.
- Keep archived and direct-link behavior backwards compatible.

## Validation

- Focused component, route, archived-dialog, and Convex query tests.
- Full Vitest suite, TypeScript checking, scoped ESLint and Prettier, production
  build, and `git diff --check`.
- Desktop and compact-sidebar visual comparison against the supplied switcher
  reference, including keyboard and no-provider states.
- Fallow changed-branch audit before committing.

## Out of scope

- A gallery-first Image landing page, image editor canvas, version graph, or
  new provider integration.
- Separate Projects or Library data per workspace.
- Remembering the last open conversation when switching products.

## Tracking

- Notion task: [Implement Dev3 Chat and Dev3 Image workspace switcher](https://app.notion.com/p/3b35615a4557810da8eec4f48840e097)
- Implementation record:
  `notes/updates/2026-08-05-dev3-workspace-switcher.md`
