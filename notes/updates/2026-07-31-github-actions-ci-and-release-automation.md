# GitHub Actions CI and Windows release automation

## Outcome

Added repository-owned GitHub Actions automation for source validation and
signed Windows desktop releases. CI validates pull requests, `master` pushes,
and manual runs. The release workflow publishes the installer, blockmap,
`latest.yml`, and Codex runtime manifest to this repository's public GitHub
release.

## Affected areas

- `.github/workflows/ci.yml` installs Bun with the frozen lockfile, validates
  GitHub Actions workflow YAML formatting, then runs type checking, Vitest, and
  the production build.
- `.github/workflows/release.yml` accepts version-tag pushes and explicit
  releases of an existing tag. It validates SemVer, package-version parity, and
  the exact tagged commit before building.
- The release job validates the configured HTTPS desktop URL, restores the
  signing certificate only in the runner temporary directory, checksum-verifies
  the official upstream Windows `osslsigncode` 2.14 archive before using it,
  signs the NSIS installer, publishes with the scoped Actions token, preserves
  artifacts for 14 days, and removes the temporary certificate on exit.
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
