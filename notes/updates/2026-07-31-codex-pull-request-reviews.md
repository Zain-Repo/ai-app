# Codex pull request reviews

## Outcome

The repository now standardizes on Codex for automated pull request reviews.
Pull request authors are directed to comment `@codex review` after opening a
pull request. CodeRabbit is no longer part of the repository review workflow.

## Affected areas

- `AGENTS.md`
- `.github/pull_request_template.md`
- GitHub App access for `Zain-Repo/ai-app`

## Validation

- Confirmed the repository contained no tracked CodeRabbit configuration,
  workflow, or documentation before the change.
- Confirmed the exact `@codex review` pull request comment trigger against the
  current Codex documentation.
- Confirmed CodeRabbit had prior review activity on this repository and is
  installed as a GitHub App rather than a repository workflow.

## Known limitation

Removing `Zain-Repo/ai-app` from the CodeRabbit GitHub App installation requires
GitHub sudo-mode authentication. The repository-side policy and pull request
template do not themselves revoke the app's GitHub access.
