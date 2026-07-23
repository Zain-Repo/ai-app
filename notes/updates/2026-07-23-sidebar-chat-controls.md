# Sidebar chat controls

## Outcome

Moved the output mode, voice, and provider controls from above the chat composer
into one compact row in the sidebar footer. Existing provider availability,
conversation locking, and image-mode routing behavior remain unchanged. Starting
voice mode from the mobile sidebar closes the sidebar sheet first.

## Affected area

- `src/routes/chat.{-$slug}.tsx`

## Validation

- `bun run typecheck`
- `bun run test` — 23 files and 68 tests passed
- `bun run build`
- Impeccable layout detector — no findings

## Known limitation

The authenticated provider state was not available for live visual browser
verification. No deployment or desktop release was performed.
