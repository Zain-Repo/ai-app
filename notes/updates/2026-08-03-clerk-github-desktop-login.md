# Clerk GitHub desktop login

## Outcome

Fixed GitHub sign-in in the Electron client. The desktop authentication window
now lets Clerk finish its OAuth callback and closes only after Clerk redirects
back to an allowed AI Harness route.

The linked Clerk application is named `AI Harness` instead of the default
`My Application`. Clerk's standard development-mode warning remains enabled on
the development instance; it is intentionally absent from the production
instance.

## Affected areas

- `electron/main/index.ts`
- `electron/main/desktop-navigation.ts`
- `electron/main/desktop-navigation.test.ts`
- Clerk application `app_3GnMp7V4gRCVXlpkUmhcB5vGXYu`

## Security and compatibility

- Desktop authentication still permits only the exact HTTPS Clerk, Account
  Portal, and GitHub origins.
- Clerk callback pages remain inside the sandboxed, shared-session auth window.
- Untrusted and lookalike origins remain blocked.
- No Clerk keys or OAuth secrets were changed.

## Validation

- Clerk CLI authentication, project link, development instance, and production
  instance were inspected successfully.
- GitHub is enabled and authenticatable in both Clerk instances.
- The development Frontend API reports `show_devmode_warning: true`; production
  reports `false` as expected.
- Focused navigation tests passed (3 tests), followed by all 223 Vitest tests
  across 47 files.
- TypeScript, scoped Prettier, `git diff --check`, and the production client/SSR
  build passed. The build emitted the existing route-file warning for
  `src/routes/chat-sidebar.test.tsx`.
- The local renderer returned HTTP 200 and the Electron window launched and
  remained responsive.

## Known limitation

Completing GitHub's interactive consent flow requires a user-controlled GitHub
session and was not automated.
