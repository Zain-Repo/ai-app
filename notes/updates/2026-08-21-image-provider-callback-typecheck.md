# Image provider callback typecheck fix

## Outcome

Adapted the Image workspace provider callback to accept the shared image
provider union while only updating the chat route's active provider for the
two image-generation providers it supports: fal and OpenRouter.

## Affected area

- `src/routes/chat.{-$slug}.tsx`

## Validation

- `bun run typecheck` passed.
- `git diff --check` passed.

## Limitation

The chat route still does not use Vercel AI Gateway for image generation. The
callback safely ignores that provider if it is ever supplied by the shared
Image workspace.
