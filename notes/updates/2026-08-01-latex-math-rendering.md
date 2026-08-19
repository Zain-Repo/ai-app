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

## 2026-08-19 compatibility follow-up

- Added shared renderer normalization for model-generated `\(...\)` inline math
  and `\[...\]` display math while retaining the existing dollar-delimited
  syntax.
- Kept inline code, fenced code blocks, escaped delimiter pairs, and incomplete
  delimiter pairs unchanged so examples and partial content are not interpreted
  as live equations.

### Validation

- The focused math suites passed all 9 tests, including the reported ordered
  list of limits and accessible KaTeX display output.
- The complete suite passed all 363 tests across 77 files with a ten-second
  per-test timeout.
- TypeScript, scoped ESLint and Prettier checks, `git diff --check`, and the
  production client and SSR builds passed. The build emitted the existing
  non-route warning for `src/routes/chat-sidebar.test.tsx`.

### Limitation

- The compatibility layer recognizes paired parenthesis and bracket delimiters;
  it does not infer unwrapped TeX expressions as math.
