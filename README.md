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
`Zain-Repo/ai-app-releases`. Create it as a public repository so installed
clients can read releases without an embedded GitHub credential, then
authenticate GitHub CLI before publishing the first release. After building the
installer, publish its installer, blockmap, and `latest.yml` assets with:

```powershell
bun run updater:publish -- --notes="Release notes"
```

The release tag defaults to `v<package-version>`. Override the destination with
`--repo=owner/repository` when needed. Publishing is a separate, explicit step and
is never performed by the installer build.

Windows code signing is not configured. Unsigned installers can trigger Microsoft
Defender SmartScreen warnings until a signing certificate and signing environment
are added.
