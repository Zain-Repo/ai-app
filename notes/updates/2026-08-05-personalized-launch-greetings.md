# Personalized launch greetings

## Summary

- Replaced the fixed chat welcome heading with six warmer personalized
  greetings.
- Selected one greeting for each renderer launch and kept it stable while the
  user navigates between chats.
- Stored the selected greeting identifier locally so the next launch cannot
  immediately repeat it.
- Continued to use the authenticated profile name when available and provided
  a natural unnamed fallback for profiles without a name.
- Rewrote the supporting instruction as one consistent, direct next step while
  preserving the existing balanced heading and readable description wrapping.

## Affected areas

- `src/lib/welcome-message.ts`
- `src/lib/welcome-message.test.tsx`
- `src/routes/chat.{-$slug}.tsx`

## Validation

- `bunx vitest run src/lib/welcome-message.test.tsx` passed 3 tests.
- `bun run test` passed 266 tests across 60 files.
- `bun run typecheck` passed.
- Scoped ESLint and Prettier checks passed.
- `bun run build` completed both client and SSR builds.
- `git diff --check` passed.

## Known limitations

- If browser storage is unavailable, the greeting still rotates for the current
  launch, but a later launch may repeat the same message.
- The user's name is omitted only when the authenticated profile does not
  provide one.
- No authenticated desktop visual smoke test was run for this copy-only change;
  the existing balanced heading and pretty-wrapped description styles remain in
  place.
