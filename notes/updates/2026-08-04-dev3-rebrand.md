# Dev3 product rebrand

## Outcome

Renamed the product from AI Harness to Dev3 across the web application,
Electron desktop client, installer metadata, release artifacts, worker defaults,
and current project documentation. Version `0.1.12` is the first Dev3-branded
release.

Generated a new premium Dev3 identity board with a graphite background,
cyan-to-cobalt gradients, a restrained amber signal accent, and a geometric
`D + 3` routing mark.

## Affected areas

- User-facing web, authentication, chat, updater, and desktop-window copy
- Electron preload API names and Codex client metadata
- Windows executable, NSIS installer, Store display name, and release workflow
- Package, manifest, terminal worker, README, and active engineering-note names
- Existing brand media filenames and the Dev3 Remotion routing composition
- `public/branding/dev3-brand-board.png`

## Compatibility

- Existing GitHub updater coordinates remain on `Zain-Repo/ai-app`.
- Electron and Microsoft Store application identities remain unchanged so
  installed clients can update in place.
- Existing Cloudflare worker, updater cache, and legacy `AI_HARNESS_*`
  environment names remain supported while new configuration uses `DEV3_*`.
- The deployed renderer accepts both `window.dev3Desktop` and the legacy
  `window.aiHarnessDesktop` bridge while pre-0.1.12 clients upgrade.
- New desktop builds expose both bridge names so a previously deployed renderer
  also remains functional during release-order skew.
- Packaged releases continue using the existing `ai-harness` user-data
  directory so browser sessions, Codex credentials, and updater state persist.
- The terminal worker keeps its legacy default state directory so pre-rebrand
  containers and volumes remain covered by idle cleanup.
- OpenRouter callbacks consume and remove either PKCE storage key so an OAuth
  redirect started before a renderer deployment can finish afterward.
- Historical implementation and release notes retain their original names so
  they continue to describe the state that existed when they were written.

## Validation

- TypeScript type checking passed.
- All 248 Vitest tests across 55 files passed, including regression coverage for
  the legacy desktop bridge, packaged user-data path, and terminal worker state
  directory, plus in-flight OpenRouter PKCE redirects.
- Scoped ESLint and Prettier checks passed for every changed source file.
- The production client and SSR build passed. It emitted the existing warning
  that `src/routes/chat-sidebar.test.tsx` is not a route.
- `git diff --check` passed.
- The generated Dev3 board was visually inspected after being copied into the
  repository, and its SHA-256 hash matches the generated source asset.
