# Open-source Windows code signing

Implemented a fail-closed Windows release-signing pipeline using
`@electron/windows-sign` for packaged-app binary discovery and `osslsigncode`
for Authenticode signatures.

## Affected areas

- Electron Forge package output is signed before NSIS packaging.
- electron-builder signs the NSIS installer and embedded uninstaller through
  the same open-source signer.
- Signing uses SHA-256 and an RFC 3161 timestamp.
- The certificate password is passed to `osslsigncode` over stdin rather than
  exposed in process arguments.
- `app-update.yml` now includes the full certificate publisher name so
  `electron-updater` verifies downloaded installer signatures.
- Release packaging stops before Forge when required signing material is
  unavailable and refuses stale or mismatched package-signing metadata.

## Validation

- `bun run installer:windows` produced a signed packaged app and NSIS
  installer.
- Independent `osslsigncode` verification passed for all 16 current PE
  binaries and the updater publisher metadata.
- Focused Vitest checks passed: 2 tests.
- The full Vitest suite passed: 71 tests across 25 files.
- TypeScript type checking passed.
- Focused ESLint and Prettier checks passed.
- The repository-wide Prettier and ESLint commands still report unrelated
  pre-existing issues outside the signing files.

## Remaining limitation

The configured certificate is self-signed and intended only for local pipeline
validation. Public distribution still requires an identity-validated
certificate or Artifact Signing profile. No release was published.
