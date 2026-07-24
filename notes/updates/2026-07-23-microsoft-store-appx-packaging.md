# Microsoft Store AppX packaging

Added a parallel Microsoft Store AppX distribution path while preserving the
existing NSIS release channel.

## Affected areas

- `bun run installer:store` packages the client for the Store and builds an
  unsigned x64 AppX under `out/store/`.
- Store identity values are required through
  `MICROSOFT_STORE_IDENTITY_NAME`, `MICROSOFT_STORE_PUBLISHER`, and
  `MICROSOFT_STORE_PUBLISHER_DISPLAY_NAME`. The optional
  `MICROSOFT_STORE_APPLICATION_ID` defaults to `AIHarness`.
- The Store builder removes certificate environment variables from the child
  process and disables certificate auto-discovery. Microsoft signs the package
  after Store certification.
- Store package metadata is distinct from signed-release and local-only
  metadata, so the existing signing and publishing gates remain fail closed.
- Microsoft Store builds use the platform-managed update path. Direct NSIS
  builds continue using the GitHub release updater.
- AppX tile assets are derived from the existing application icon.

## Validation

- The full Vitest suite passed: 80 tests across 28 files.
- The production web build passed.
- A complete Store packaging run produced an unsigned x64 AppX containing a
  full-trust Electron application and no `app-update.yml`.
- The generated package manifest matched the supplied validation identity,
  application ID, version, and architecture.

## Remaining limitation

The validation artifact used placeholder identity data and must not be
submitted. A production Store package requires the exact identity and publisher
values assigned in Partner Center. No Store submission or publication was
performed.

## References

- [Microsoft Store MSIX package requirements](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/app-package-requirements)
- [MSIX package signing overview](https://learn.microsoft.com/en-us/windows/msix/package/signing-package-overview)
