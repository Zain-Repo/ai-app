# Adopt Dev3 while preserving installed application identity

## Context

The product needed a distinct public name and visual direction. A direct rename
of every technical identifier would make Windows, Microsoft Store, Cloudflare,
and Electron updater infrastructure treat Dev3 as a different application or
deployment, interrupting existing installations.

## Decision

Use Dev3 for all current user-facing branding, package metadata, executable and
installer names, release titles, application copy, and new environment-variable
names. Publish the first branded release as version `0.1.12` with
`dev3-setup.exe` as the Windows installer.

Preserve these compatibility identifiers until a separately planned migration
can account for installed clients and external infrastructure:

- GitHub repository and updater feed: `Zain-Repo/ai-app`
- Electron application ID: `com.zain.ai-harness`
- Microsoft Store application ID: `AIHarness`
- Cloudflare worker name: `ai-harness`
- Electron updater cache directory: `ai-app-updater`
- Packaged user-data directory: `ai-harness`
- Terminal worker state directory: `ai-harness-terminal-worker`
- Terminal worker default image: `ai-harness-terminal:local`

Treat `DEV3_*` as the primary packaging and runtime environment-variable prefix,
while accepting the corresponding `AI_HARNESS_*` variables as legacy fallbacks.
The deployed renderer resolves both the Dev3 preload bridge and the legacy
`window.aiHarnessDesktop` bridge until older clients have upgraded. New preload
bundles expose both names as the same restricted API so either deployment order
remains compatible. OpenRouter callback handling consumes either PKCE storage
key so an authorization started before deployment can complete afterward.

## Consequences

- New installs and visible release assets consistently use Dev3.
- Existing desktop and Store installations retain their update lineage instead
  of being orphaned by a new application identity.
- Existing deployment and CI configuration can migrate incrementally to
  `DEV3_*` without blocking this release.
- Existing browser sessions, Codex credentials, updater state, and terminal
  cleanup metadata remain available across the visible rename.
- Renaming the GitHub repository, Cloudflare worker, Store registration, or
  Electron application ID remains out of scope and requires its own migration
  and rollback plan.

## Evidence

- The release workflow, builder configuration, and publisher agree on the
  `dev3-setup.exe` artifact and Dev3 release title.
- The application type-check, focused lint and formatting checks, full 250-test
  suite, and production build pass with the compatibility identifiers retained.
