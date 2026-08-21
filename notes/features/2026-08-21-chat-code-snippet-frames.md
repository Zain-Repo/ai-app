# Chat code snippet frames

## Feature statement

Render model-generated fenced code blocks as polished, self-contained code
frames in assistant chat responses. Each frame should identify the language,
apply readable syntax highlighting, preserve horizontal scrolling, and provide
an accessible copy action with clear success feedback.

## Implementation steps

1. Upgrade the shared chat code-block component to tokenize supported
   languages asynchronously while keeping raw code visible during loading.
2. Normalize common language aliases and fall back safely for unknown or
   unlabeled fences.
3. Add a labelled header, code icon, and copy-state feedback without changing
   inline-code rendering or the existing browser Python run action.
4. Add focused component tests for rendering, highlighting fallback, copy
   behavior, and Python compatibility.

## Acceptance criteria

- Fenced code in assistant responses renders inside a distinct rounded frame.
- The header shows a human-readable language label and an accessible copy
  control.
- Supported languages receive light- and dark-theme syntax highlighting.
- Unknown or omitted languages remain readable and copyable without errors.
- Copying places the original source text on the clipboard and announces the
  temporary copied state visually and to assistive technology.
- Inline code and executable Python blocks keep their current behavior.
- Long lines scroll horizontally without widening the chat layout.

## Security and reliability constraints

- Highlighting must treat model output as text and must not execute it.
- The clipboard action must run only after an explicit user activation.
- Highlighting failures must degrade to escaped plain text rather than hiding
  the snippet or failing the response renderer.
- No new raw-HTML rendering path or trust-boundary bypass may be introduced.

## Validation

- Run focused Vitest coverage for the message and code-block components.
- Run TypeScript, focused ESLint and Prettier checks, the production build, and
  `git diff --check`.
- Smoke-test desktop and narrow chat widths, keyboard focus, copy feedback,
  long-line overflow, light theme, and dark theme when the local app can be
  opened.

## Out of scope

- Editing or downloading snippets as files.
- Adding execution support for languages other than the existing browser
  Python path.
- Line highlighting, diff annotations, filenames, or a full code editor.
