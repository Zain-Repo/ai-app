# Text shimmer loader

## Completed

- Installed the `@loading-ui/text-shimmer` registry component at
  `src/components/text-shimmer.tsx`.
- Replaced the hand-rolled text gradient in the chat `ThinkingIndicator` with
  `TextShimmer`, while retaining the existing word transition, theme colors,
  icon animation, and reduced-motion fallback.
- Added a focused regression test for the visible shimmer styles.

## Validation

- `bunx vitest run src/components/ui/thinking-indicator.test.tsx` passed.
- Targeted ESLint and Prettier checks passed for the new and changed files.
- `bun run typecheck` passed.
- `git diff --check` passed for the changed implementation and test files.

## Limitation

- The registry component animates only in the normal-motion branch; reduced
  motion intentionally keeps the existing static label behavior.
