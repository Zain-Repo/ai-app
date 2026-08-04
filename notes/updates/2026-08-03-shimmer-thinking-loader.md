# Shimmer thinking loader

## Completed

- Removed the standalone `ThinkingIndicator` component and its test.
- Pending model responses now render the existing `TextShimmer` registry
  component directly with an accessible `status` announcement.
- Kept the existing Iconiq `ReasoningSteps` registry component for persisted
  model reasoning steps.

## Validation

- `bun run typecheck` passed.
- `bun run test` passed: 48 files and 227 tests.
- Targeted ESLint passed for the route and shimmer component.
- Targeted Prettier and `git diff --check` passed for the authored route and
  note changes.

## Limitation

- The pre-existing `src/components/text-shimmer.tsx` registry file still emits
  a Prettier warning when checked directly; it was not reformatted as part of
  this focused removal.
