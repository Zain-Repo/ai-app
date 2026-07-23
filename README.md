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
- `out/nsis/ai-harness-setup-<version>.exe` for the installer
- `out/nsis/latest.yml` and the installer blockmap for updates

Packaging rejects missing or non-HTTPS renderer URLs. It also rejects stale
package metadata and a packaged version that differs from `package.json`.

## Updater releases

The updater is configured for the separate release-asset repository
`Zain-Repo/ai-harness-releases`. Create it as a public repository so installed
clients can read releases without an embedded GitHub credential, then
authenticate GitHub CLI before publishing the first release. After building the
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

## Windows code signing

Windows release builds use the open-source `@electron/windows-sign` and
`osslsigncode` tools. Install `osslsigncode` 2.14 or newer, then provide these
values through local or CI secrets:

- `AI_HARNESS_OSSLSIGNCODE_PATH` (optional when `osslsigncode` is on `PATH`)
- `WINDOWS_CERTIFICATE_FILE` (PKCS#12/PFX code-signing certificate)
- `WINDOWS_CERTIFICATE_PASSWORD`
- `WINDOWS_SIGN_PUBLISHER_NAME` (the certificate's full subject DN)
- `WINDOWS_TIMESTAMP_SERVER` (optional; defaults to DigiCert's RFC 3161 server)
- `WINDOWS_SIGN_WEBSITE` (optional)

`bun run installer:windows` signs the packaged application binaries first, then
the NSIS installer and embedded uninstaller. The build fails rather than produce
an unsigned release. Never commit the certificate or its password.
