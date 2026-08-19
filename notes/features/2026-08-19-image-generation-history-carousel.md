# Image generation history carousel

## Summary

Replace the static Recent / Variations placeholders in the image workspace with
the authenticated user's stored generated images and load additional database
pages as the user advances through the carousel.

## Implementation

1. Reuse the owner-scoped, paginated Convex Library query with the
   `generated_image` category so every carousel item represents one stored
   output, including multi-output variations.
2. Render the newest signed storage URLs first in the existing accessible
   carousel primitive with responsive slide widths and explicit previous/next
   controls.
3. Request another bounded page when the selected slide approaches the end of
   the loaded results, continuing until Convex reports that pagination is
   exhausted.
4. Preserve loading, empty, unavailable-image, keyboard, reduced-motion, and
   responsive behavior without changing the full conversation generation view.

## Acceptance criteria

- Recent generated images appear from Convex storage instead of static
  placeholders.
- Results are scoped to the authenticated owner by the backend query.
- A user can move through every stored generated image, beyond the initial
  carousel page.
- Broken or missing signed URLs show a controlled fallback rather than the
  browser's broken-image indicator.
- The carousel remains usable with pointer, touch, and keyboard input.

## Security and reliability constraints

- Do not accept a client-provided owner identifier.
- Keep database reads bounded through Convex cursor pagination.
- Reuse existing Library ownership checks and storage URL resolution.
- Do not introduce new persistence or duplicate generated-image records.

## Validation

- Focused component tests for initial database arguments, image rendering,
  fallback behavior, and next-page loading.
- TypeScript, scoped ESLint, Prettier, production build, and relevant regression
  tests.

## Out of scope

- Changing generation-set persistence or provider execution.
- Adding image editing, deletion, or bulk actions to the carousel.
- Replacing the full per-conversation generation history.
