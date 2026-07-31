# GitHub Actions CI and Windows release automation

## Outcome

Added repository-owned GitHub Actions automation for source validation and
signed Windows desktop releases. CI validates pull requests, `master` pushes,
and manual runs. After a successful `master` push, CI calls the reusable release
workflow with the exact tested commit. The release workflow publishes the
installer, blockmap, `latest.yml`, and Codex runtime manifest to this
repository's public GitHub release.

## Affected areas

- `.github/workflows/ci.yml` installs Bun with the frozen lockfile, validates
  GitHub Actions workflow YAML formatting, then runs type checking, Vitest, and
  the production build.
- `.github/workflows/release.yml` is called only by successful `master` push CI.
  It derives the release tag from `package.json`, verifies the exact tested
  commit is still the tip of `origin/master`, and skips versions that are
  already public.
- The release job validates the configured HTTPS desktop URL, restores the
  signing PFX in the runner temporary directory, and imports its certificate
  into the current user's Windows certificate store so native Authenticode
  verification works on GitHub's Windows runner. It verifies the imported
  subject exactly matches `WINDOWS_SIGN_PUBLISHER_NAME`, checksum-verifies the
  official upstream Windows `osslsigncode` 2.14 archive before using it, signs
  the NSIS installer, publishes with the scoped Actions token through a
  draft/upload/verify/publish sequence, preserves artifacts for 14 days, and
  removes both the imported certificate and temporary PFX on exit.
- `README.md` records the release trigger, required repository configuration,
  and local installer artifact name.

## Required repository configuration

- Secrets: `WINDOWS_CERTIFICATE_BASE64` and
  `WINDOWS_CERTIFICATE_PASSWORD`.
- Variables: `AI_HARNESS_DESKTOP_URL` and
  `WINDOWS_SIGN_PUBLISHER_NAME`.
- Optional variables: `WINDOWS_TIMESTAMP_SERVER` and
  `WINDOWS_SIGN_WEBSITE`.

## Validation

- Inspected the completed CI and release workflow contracts.
- Confirmed the documented inputs and updater destination match the workflow,
  release scripts, and `electron-builder.json`.
- Documentation formatting and diff checks were run after this record was
  created.
