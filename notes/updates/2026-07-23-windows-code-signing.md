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
- Windows validates the certificate chain, code-signing usage, exact publisher
  subject, and each generated Authenticode signature before accepting a build.
- Self-signed certificates are rejected even when they can produce a
  syntactically valid signature.
- Updater publishing rechecks the exact packaged executable and NSIS installer
  against Windows trust before accessing GitHub.
- `bun run package:client:local` creates an unsigned unpacked application for
  testing on the current machine and stamps its metadata `localOnly: true`.
  `bun run installer:windows:local` additionally creates a distinctly named
  unsigned installer under `out/local-nsis/`. The signed package, NSIS, and
  updater publishing commands remain unchanged and reject local-only metadata.
- `app-update.yml` now includes the full certificate publisher name so
  `electron-updater` verifies downloaded installer signatures.
- Release packaging stops before Forge when required signing material is
  unavailable and refuses stale or mismatched package-signing metadata.

## Validation

- The trust-gate Vitest checks pass: 3 tests.
- A Microsoft-signed Windows executable passed the new verifier.
- The existing `0.1.7` installer was correctly rejected with an untrusted-root
  diagnostic.
- The full Vitest suite passed: 73 tests across 26 files.
- TypeScript type checking passed.
- Focused ESLint and Prettier checks and `git diff --check` passed.
- A new release build was not run because no identity-validated signing
  certificate is configured in the current environment.
- The unsigned local-only route produced a fresh packaged application, and its
  metadata contained `localOnly: true` with no signing claim.
- The local-only NSIS route produced
  `out/local-nsis/ai-harness-local-setup.exe` without publishing or uploading
  release assets. It removes generated blockmap and `latest.yml` files so only
  the manual installer remains.

## Remaining limitation

Release
[`v0.1.7`](https://github.com/Zain-Repo/ai-harness-releases/releases/tag/v0.1.7)
was signed with the old self-signed test certificate and remains untrusted.
Replace it with an identity-validated certificate and publish a higher version;
signatures on already-published installers cannot be repaired in place.
