# Windows release version gate

## Outcome

The Windows publish workflow now starts only when the version in `package.json`
does not have a published GitHub release or when that version has a draft release
to resume. Ordinary `master` pushes for an already-published version still run CI,
but skip the Windows runner entirely.

## Affected areas

- `.github/workflows/ci.yml` exposes the release-readiness result from the existing
  Linux validation job and conditions the reusable Windows release job on it.
- `.github/workflows/release.yml` remains the authoritative safety check before
  packaging and publication.

## Validation

- Prettier workflow and note checks.
- Local release-gate checks for published, draft, and missing release states.
- `git diff --check` and focused diff review.
