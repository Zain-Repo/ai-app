# Remove Windows release signing

## Outcome

Removed certificate-based signing from the current Windows packaging and GitHub
release workflow. Successful `master` CI runs now build and publish an unsigned
NSIS installer without signing secrets or certificate setup.

## Affected areas

- `.github/workflows/ci.yml` calls the release workflow without forwarding
  signing secrets.
- `.github/workflows/release.yml` no longer installs a signing utility, restores
  or imports a certificate, passes signing variables, or performs certificate
  cleanup.
- `scripts/windows-signing.mjs` and its tests were removed, along with the
  direct `@electron/windows-sign` dependency.
- Forge, NSIS, and release publication now require explicit unsigned package
  metadata and reject stale signing claims. Packaging also strips ambient
  signing credentials, disables certificate discovery, and removes custom
  signing hooks.
- `README.md` documents the remaining release configuration and the expected
  Windows unknown-publisher warning for unsigned installers.

## Validation

- Frozen dependency installation, 101 Vitest tests across 30 files, TypeScript,
  the production build, and the Codex app-server smoke test passed.
- GitHub Actions workflow syntax was checked with `actionlint`; updated files
  passed Prettier and repository diff whitespace validation.
- A real Windows release build produced `ai-harness.exe`, the NSIS installer,
  blockmap, and `latest.yml`. Windows reported both executables as `NotSigned`,
  and the packaged updater configuration targets `Zain-Repo/ai-app`.
- The first CI release build passed but exposed a draft-publication edge case:
  GitHub does not create the tag ref until a draft is published. The publisher
  now validates the draft's immutable 40-character `targetCommitish` directly
  instead of trying to resolve the not-yet-created tag.

## Known limitation

Unsigned installers can trigger Windows unknown-publisher and SmartScreen
warnings. Release commit gating and atomic GitHub publication remain in place,
but they do not replace operating-system publisher verification.
