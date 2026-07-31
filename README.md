# AI Harness

AI Harness is a TanStack Start application with a Convex backend and an optional
Electron desktop client. The desktop client loads the deployed web application in
a hardened Electron window and adds a local Codex bridge so users can sign in with
their ChatGPT account without sending OpenAI credentials to Convex.

## Web development

Install dependencies and start the web application:

```powershell
bun install
bun run dev
```

## Desktop development

Start the web development server and Electron together:

```powershell
bun run desktop:dev
```

The ChatGPT subscription option is shown only inside Electron. Codex OAuth and
session data are stored by the bundled Codex runtime under Electron's per-user app
data directory. Convex stores only non-secret account metadata used to identify the
connection.

To verify that the bundled Codex app-server can start and answer its account RPC
without opening the Electron UI, run:

```powershell
bun run desktop:codex:smoke
```

## Windows installer

The production desktop client is a thin wrapper around the deployed HTTPS web
application. Set its trusted renderer URL before packaging:

```powershell
$env:AI_HARNESS_DESKTOP_URL = "https://app.a2zsoftware.ca/"
bun run installer:windows
```

`installer:windows` first creates a fresh Electron package, then builds the x64
assisted NSIS installer. Outputs are written to:

- `out/packages/` for unpacked Electron packages
- `out/nsis/ai-harness-setup.exe` for the installer
- `out/nsis/latest.yml` and the installer blockmap for updates

Packaging rejects missing or non-HTTPS renderer URLs. It also rejects stale
package metadata and a packaged version that differs from `package.json`.

## Updater releases

The updater publishes to this public repository, `Zain-Repo/ai-app`, so
installed clients can read releases without an embedded GitHub credential.
Authenticate GitHub CLI before publishing the first release. After building the
installer, publish its installer, blockmap, `latest.yml`, and Codex runtime
manifest assets with:

```powershell
bun run updater:publish -- --notes="Release notes"
```

The release tag defaults to `v<package-version>`. Override the destination with
`--repo=owner/repository` when needed. Publishing is a separate, explicit step and
is never performed by the installer build. Publishing reads the Codex version
from the packaged executable and fails if it is behind OpenAI's latest stable
`@openai/codex` release.

## GitHub Actions CI and releases

CI runs on pull requests, pushes to `master`, and manual dispatch. It installs
the locked Bun dependencies, checks GitHub Actions workflow YAML formatting,
then runs type checking, Vitest, and the production build.

To publish the signed Windows installer, push a `vMAJOR.MINOR.PATCH` SemVer tag
whose version exactly matches `package.json`, or manually run **Release Windows
desktop app** for an existing matching tag. The workflow checks out that exact
tagged commit, repeats the source validation, checksum-verifies and uses the
official upstream Windows `osslsigncode` 2.14 archive, builds and signs the
installer, and publishes the updater assets to `Zain-Repo/ai-app`.

Configure these GitHub repository settings before the first release:

Required secrets:

- `WINDOWS_CERTIFICATE_BASE64`: the base64-encoded PKCS#12/PFX signing certificate.
- `WINDOWS_CERTIFICATE_PASSWORD`: the certificate password.

Required variables:

- `AI_HARNESS_DESKTOP_URL`: the absolute HTTPS URL loaded by the desktop client.
- `WINDOWS_SIGN_PUBLISHER_NAME`: the certificate's full subject DN.

Optional variables:

- `WINDOWS_TIMESTAMP_SERVER`: RFC 3161 timestamp server; the signing-script default applies when unset.
- `WINDOWS_SIGN_WEBSITE`: signing metadata website; defaults to this repository when unset.

The release workflow uses its scoped GitHub Actions token to create and upload
the GitHub release; no personal access token is required. Keep the repository
public so installed clients can download updater assets without credentials.

## Windows code signing

Windows release builds use the open-source `@electron/windows-sign` and
`osslsigncode` tools. For local release builds, install `osslsigncode` 2.14 or
newer, then provide these values through local environment configuration:

- `AI_HARNESS_OSSLSIGNCODE_PATH` (optional when `osslsigncode` is on `PATH`)
- `WINDOWS_CERTIFICATE_FILE` (PKCS#12/PFX code-signing certificate)
- `WINDOWS_CERTIFICATE_PASSWORD`
- `WINDOWS_SIGN_PUBLISHER_NAME` (the certificate's full subject DN)
- `WINDOWS_TIMESTAMP_SERVER` (optional; defaults to DigiCert's RFC 3161 server)
- `WINDOWS_SIGN_WEBSITE` (optional)

`bun run installer:windows` signs the packaged application binaries first, then
the NSIS installer and embedded uninstaller. Packaging verifies every generated
Authenticode signature against the configured publisher, and publishing
rechecks the exact packaged executable and installer. An identity-validated
certificate avoids Windows unknown-publisher warnings; a self-signed
certificate keeps the release pipeline and updater compatible but remains
untrusted by Windows. Never commit the certificate or its password.
