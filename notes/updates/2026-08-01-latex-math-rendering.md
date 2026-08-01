# LaTeX math rendering

## Completed

- Declared KaTeX as a direct runtime dependency because the application imports
  its stylesheet.
- Configured the shared Streamdown message renderer to support single-dollar
  inline LaTeX alongside display equations.
- Added shared prompt guidance for inline and display LaTeX delimiters.
- Added renderer and system-prompt regression coverage for math formatting.

## Validation

- `bun run test` passed: 35 test files and 151 tests.
- `bun run typecheck` and `bun run build` passed; the client and SSR build
  emitted KaTeX assets.
- Scoped ESLint and Prettier checks for the changed files passed, as did
  `git diff --check`.
- Repo-wide `bun run lint` remains failing on pre-existing, out-of-scope
  generated Convex JavaScript, bundled `.agents` skill templates,
  `.worktrees/coding-agent-workbench`, and unrelated UI files; those failures
  are not attributed to this feature.

## Limitation

- Backslash-parenthesis and backslash-bracket delimiters are not configured;
  the renderer supports the documented dollar-delimited Markdown math syntax.
