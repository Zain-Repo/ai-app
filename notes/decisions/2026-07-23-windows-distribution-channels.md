# Windows distribution channels

## Context

Directly downloaded Windows installers require a publicly trusted
Authenticode certificate to avoid unknown-publisher reputation warnings.
Microsoft Store certification instead applies the Store signature to an
AppX/MSIX package.

## Decision

Keep two independent Windows distribution channels:

- NSIS remains the direct-download and GitHub automatic-update channel.
- AppX is the Microsoft Store channel and relies on Store-managed installation,
  signing, and updates.

The Store path does not replace NSIS. Store builds are marked during Forge
packaging, do not run the direct-release signer, do not include the GitHub
updater configuration, and check `process.windowsStore` at runtime before
enabling update checks.

## Consequences

- The Store can provide a trusted, no-certificate-cost installation path after
  certification.
- Direct downloads still require a publicly trusted signing certificate or
  Windows may warn users.
- Release automation must provide the exact Partner Center package identity
  values for Store builds.
- Store and direct builds retain separate update ownership, preventing two
  update mechanisms from competing.

## Evidence

- Microsoft documents that Store certification re-signs submitted MSIX/AppX
  packages, while directly distributed packages require a trusted signature.
- Electron exposes `process.windowsStore` for Store-packaged applications.
- The validated AppX contains a full-trust Electron entry point and omits the
  GitHub updater configuration.
