# Clerk GitHub desktop login

## Outcome

Fixed GitHub sign-in in the Electron client. The desktop authentication window
now lets Clerk finish its OAuth callback and closes only after Clerk redirects
back to an allowed AI Harness route.

The linked Clerk application is named `Dev3`. Clerk's standard development-mode
warning remains enabled on the development instance; it is intentionally absent
from the production instance.

## 2026-08-04 follow-up

The Dev3 rebrand left two desktop-specific authentication settings behind. The
Electron navigation policy allowed the production Clerk callback hosts but
blocked Clerk's exact shared development callback origin,
`https://clerk.shared.lcl.dev`. GitHub could open in the desktop authentication
window, but the development OAuth return could not finish. The exact callback
origin is now allowed while lookalike hosts remain blocked.

The Clerk application identity also still reported `AI Harness` to both Clerk
instances. The linked application was renamed to `Dev3`; the development and
production Frontend APIs now both report the current name with GitHub enabled
and authenticatable.

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
- The 2026-08-04 follow-up passed all 256 Vitest tests across 58 files,
  TypeScript, scoped ESLint and Prettier, `git diff --check`, and the production
  client/SSR build. A clean Electron development session reproduced the GitHub
  callback through `clerk.shared.lcl.dev`; a clean session against the deployed
  renderer reached GitHub with the production callback at
  `clerk.a2zsoftware.ca`.
- Repository-wide ESLint and Prettier remain blocked by pre-existing generated,
  skill-template, and unrelated UI findings; the changed files pass both
  scoped checks.

## Known limitation

Completing GitHub's interactive consent flow requires a user-controlled GitHub
session and was not automated.
