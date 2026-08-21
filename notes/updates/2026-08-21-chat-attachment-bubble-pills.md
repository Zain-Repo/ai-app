# Chat message attachment pills

## Outcome

User-message file attachments now render as compact inset pills inside the
colored user bubble, directly below the message text, instead of a detached
`bg-card` card. Each pill shows an 8x8 thumbnail (image preview or
`FileText` icon tile), the truncated filename, and the file size, and links
to the stored attachment with hover and focus-visible states. Multiple
attachments wrap within the bubble.

Assistant-message attachment rendering is unchanged.

## Affected areas

- `src/routes/chat.{-$slug}.tsx` (user-message attachment block only)

## Validation

- `npm run typecheck`: only pre-existing error at line 3444
  (`ImageProvider` vs provider state type), confirmed present on clean
  `master`.
- ESLint on the changed file passes; repo-wide lint errors are pre-existing
  in unrelated files.

## Known limitations

- Composer (pre-send) attachment previews in `ai-input.tsx` keep their
  existing style.
