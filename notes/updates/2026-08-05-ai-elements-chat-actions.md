# AI Elements chat actions and starter prompts

## Summary

Installed the AI Elements `response-actions` and `suggested-actions` registry
components as locally owned source. New conversations now offer distinct Dev3
Chat and Dev3 Image starter prompts, and completed assistant text responses
provide an accessible copy action.

## Implementation

- Adapted the registry response toolbar to the repository's Base UI tooltip API
  and design tokens.
- Limited the integrated response action to copy. Regeneration, branching,
  feedback, sharing, citations, and tool controls remain outside this feature
  because their product or backend semantics are not implemented here.
- Added clipboard failure feedback and cleared delayed status timers when the
  toolbar unmounts.
- Added disabled starter-prompt behavior so unavailable, archived, loading, or
  sending chats cannot submit a second request.
- Kept workspace-specific prompt definitions in a small typed library module
  instead of expanding the chat route further.

## Affected areas

- `src/components/ai-response-actions.tsx`
- `src/components/ai-suggested-actions.tsx`
- `src/lib/chat-starter-suggestions.ts`
- `src/routes/chat.{-$slug}.tsx`
- Focused component, prompt, and chat-route tests

## Validation

- `bun run test`: 64 files and 285 tests passed.
- `bun run typecheck`: passed.
- Scoped ESLint and Prettier checks for every changed TypeScript file: passed.
- `bun run build`: client and SSR production builds passed, with the existing
  non-route warning for `src/routes/chat-sidebar.test.tsx`.

## Known limitations

- No authenticated desktop visual smoke test was run.
- Repository-wide `bun run lint` and `bun run check` remain blocked by existing
  parsing and formatting findings in bundled skill templates, generated Convex
  files, and unrelated source files. The files changed by this feature pass the
  same scoped checks.
