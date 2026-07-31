<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

## Project Documentation

- Record completed implementation work in `notes/updates/`.
- Record proposed features in `notes/features/`.
- Record lasting technical decisions in `notes/decisions/`.
- Use one dated Markdown file per topic and follow `notes/README.md`.
- Mirror completed changes and decisions to the [AI-APP Engineering Notes](https://app.notion.com/p/3a65615a45578113b272cfb82c0ff235) page.
- Create or update planned features in the [AI-APP tasks](https://app.notion.com/p/3a55615a455780f385c6f7388200365e) database.
- Search local notes and Notion before creating a new record to avoid duplicates.

## Feature Branch and Review Workflow

- For every new feature, create and work on a dedicated branch before making implementation changes. Use the repository's `codex/` branch prefix unless a different prefix is explicitly requested.
- After the feature is implemented and locally validated, push the same branch to GitHub and request review by commenting `@codex review` on the pull request.
- Stop after requesting review so the user can inspect the changes and trigger the fix workflow themselves.
- When a review fix is handed back, apply the requested fixes on the existing feature branch, run the relevant validation again, push the same branch, and request another `@codex review`.
- Repeat the fix, push, and re-review cycle until no new actionable fixes are reported.

## Pull Request Reviews

- Use Codex as the repository's automated pull request reviewer.
- Request a review by commenting `@codex review` on the pull request.
- Do not enable or use CodeRabbit for this repository.
