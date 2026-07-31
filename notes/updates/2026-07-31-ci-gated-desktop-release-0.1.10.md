# CI-gated desktop release 0.1.10 preparation

## Outcome

Prepared AI Harness `0.1.10` for automatic unsigned Windows publication after a
successful `master` CI run. CI calls the release workflow only after validation
passes, and the release workflow uses the exact tested commit. The bundled
Codex CLI dependency is updated to stable version `0.146.0` so the publisher's
current-runtime check can pass.

## Affected areas

- `.github/workflows/ci.yml` calls the reusable Windows release workflow only
  for a successful `master` push after the validation job.
- `.github/workflows/release.yml` verifies the tested commit is still the tip of
  `origin/master`, derives `v0.1.10` from `package.json`, and treats an already
  published version as a successful no-op.
- The release workflow and publisher are restricted to `Zain-Repo/ai-app`.
- Release publication creates or resumes a draft, uploads and verifies every
  updater asset, then makes the complete release public and marks it latest.
- `package.json` and `bun.lock` advance the app to `0.1.10` and
  `@openai/codex` to `0.146.0`.
- Third-party GitHub Actions are pinned to reviewed commit SHAs, checkout does
  not persist credentials, and the release workflow does not require signing
  secrets.

## Required repository configuration

- Variable: `AI_HARNESS_DESKTOP_URL`.

The automatic release publishes an unsigned installer and does not require a
certificate or signing secrets.

## Validation

- Regenerated and reinstalled the frozen lockfile with Bun `1.3.13`.
- Confirmed `codex-cli 0.146.0` is installed and its app server initializes and
  accepts the `account/read` smoke request.
- Covered draft creation, same-commit draft reuse, expected-asset verification,
  published-release refusal, and mismatched-target refusal in focused publisher
  tests.
- Checked the updated Markdown formatting and repository diff integrity.

## Known limitation

Existing installations through `0.1.9` retain the previous
`Zain-Repo/ai-harness-releases` feed in their packaged updater configuration.
Because releases are now restricted to `Zain-Repo/ai-app`, those installations
need one manual installer update before they can discover later releases from
the source repository.
