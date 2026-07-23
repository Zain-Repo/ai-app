# Bundled Codex runtime updates

## Outcome

Extended the existing signed desktop updater so AI Harness and its bundled
Codex CLI update as one release. The App updates dialog now reports the
installed app and Codex versions plus the versions included in an available
update. Before installation, Electron stops the Codex app-server so Windows can
replace the runtime cleanly.

Release publishing now reads the Codex version from the packaged executable,
compares it with OpenAI's latest stable `@openai/codex` release, and refuses to
publish a stale bundle. Each future release also publishes a small
`codex-runtime.json` manifest so installed clients can display the exact Codex
version included in that signed installer.

## Design decision

AI Harness does not run a global package-manager update on the user's machine.
The app continues to own its Codex executable, credentials remain in the
existing per-user Codex home, and the signed AI Harness installer is the only
runtime replacement path.

## Affected areas

- `electron/main/codex-app-server.ts`
- `electron/main/codex-runtime.ts`
- `electron/main/updater.ts`
- `electron/main/updater-state.ts`
- `electron/main/index.ts`
- `electron/types.ts`
- `src/components/desktop-updater.tsx`
- `scripts/publish-updater-release.mjs`
- `README.md`
- Focused updater and runtime tests

## Validation

- `bun run test` — 26 files and 72 tests passed
- `bun run typecheck`
- `bun run build`
- Focused ESLint and Prettier checks
- `git diff --check`
- Impeccable UI detector — no findings
- OpenAI npm registry reported `0.145.0`, matching the packaged dependency

## Limitations

The first combined app and Codex runtime release was published as
[`v0.1.7`](https://github.com/Zain-Repo/ai-harness-releases/releases/tag/v0.1.7).
Its `codex-runtime.json` manifest identifies app version `0.1.7` and Codex
version `0.145.0`.
