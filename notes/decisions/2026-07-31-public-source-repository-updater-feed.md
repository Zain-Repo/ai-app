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
release tag. This repository target is fixed rather than a caller-selectable
publishing option.

## Consequences

- Release assets, the updater manifest, runtime metadata, and public download
  links now share the source repository and release tag.
- Installed clients can retrieve update metadata and assets without embedded
  GitHub credentials because the repository remains public.
- GitHub Actions releases publish to the current repository through the scoped
  workflow token rather than a separate release-asset repository.
- Publication remains a draft while updater assets are uploaded and verified.
  The release is made public and marked latest only after every expected asset
  is present, so a failed upload cannot expose a partial updater feed.

## One-time migration limitation

Existing desktop installations retain an `app-update.yml` feed URL for
`Zain-Repo/ai-harness-releases`; an already-installed updater cannot discover
the new feed automatically. Those users need one manual installer update from
`Zain-Repo/ai-app`. After that update, later releases use the source-repository
feed.

## Evidence

- `electron-builder.json`, release publishing, runtime metadata retrieval, and
  landing downloads all use `Zain-Repo/ai-app`.
- The release workflow rejects execution outside `Zain-Repo/ai-app`, and the
  publisher hard-codes that same repository instead of accepting an override.
- The publisher verifies the draft assets before making the release public.
