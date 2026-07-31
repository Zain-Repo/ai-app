# Use the public source repository as the updater feed

## Context

AI Harness previously published Windows updater assets to the separate public
`Zain-Repo/ai-harness-releases` repository. The desktop updater feed, Codex
runtime manifest URL, release publisher default, signing metadata, and landing
download links needed to move with release automation into the public source
repository.

## Decision

Use public GitHub releases in `Zain-Repo/ai-app` as the single direct-download
and Electron updater feed. Future release automation publishes its installer,
blockmap, `latest.yml`, and Codex runtime manifest to the source repository's
release tag.

## Consequences

- Release assets, the updater manifest, runtime metadata, and public download
  links now share the source repository and release tag.
- Installed clients can retrieve update metadata and assets without embedded
  GitHub credentials because the repository remains public.
- GitHub Actions releases publish to the current repository through the scoped
  workflow token rather than a separate release-asset repository.

## One-time migration limitation

Existing desktop installations retain an `app-update.yml` feed URL for
`Zain-Repo/ai-harness-releases`; an already-installed updater cannot discover
the new feed automatically. Those users need one manual installer update from
`Zain-Repo/ai-app`. After that update, later releases use the source-repository
feed.

## Evidence

- `electron-builder.json`, release publishing, runtime metadata retrieval, and
  landing downloads all use `Zain-Repo/ai-app`.
- The release workflow explicitly passes `GITHUB_REPOSITORY` to updater
  publishing, keeping release assets aligned with the source repository.
