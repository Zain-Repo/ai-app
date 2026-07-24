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
- Packaging validates each generated Authenticode signature and exact publisher
  subject. A self-signed certificate is accepted for release continuity but
  remains untrusted by Windows.
- Updater publishing rechecks the exact packaged executable and NSIS installer
  against the configured publisher before accessing GitHub.
- `bun run package:client:local` creates an unsigned unpacked application for
  testing on the current machine and stamps its metadata `localOnly: true`.
  `bun run installer:windows:local` additionally creates a distinctly named
  unsigned installer under `out/local-nsis/`. The signed package, NSIS, and
  updater publishing commands remain unchanged and reject local-only metadata.
- Release `app-update.yml` omits `publisherName`, preserving the updater
  behavior used by unsigned builds while `latest.yml` retains SHA-512 artifact
  integrity.
- Release packaging stops before Forge when required signing material is
  unavailable and refuses stale or mismatched package-signing metadata.

## Validation

- The signing regression checks pass: 5 tests across 2 focused files.
- The full Vitest suite passed: 75 tests across 27 files.
- TypeScript type checking passed.
- Focused ESLint and Prettier checks and `git diff --check` passed.
- The `0.1.8` release package and installer were signed with the configured
  publisher and published through the automatic updater feed.
- The unsigned local-only route produced a fresh packaged application, and its
  metadata contained `localOnly: true` with no signing claim.
- The local-only NSIS route produced
  `out/local-nsis/ai-harness-local-setup.exe` without publishing or uploading
  release assets. It removes generated blockmap and `latest.yml` files so only
  the manual installer remains.

## Remaining limitation

The configured certificate is self-signed, so Windows still reports an
unknown-publisher warning. Releases `0.1.5` through `0.1.7` embedded a publisher
pin and cannot accept this untrusted signer through their updater unless the
test certificate is trusted locally; those installations require one manual
update to `0.1.8`.
