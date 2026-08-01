# Project source Attachment processing UI

## Outcome

Project source rows now use the shadcn Attachment component composition for a
more consistent file surface. Sources in queued, extracting, or indexing
states show a restrained scan animation, a shimmer title, and a truthful
two-step pipeline for extracting text and embedding chunks.

## Affected areas

- Project source rows use Attachment media, content, title, description,
  actions, and trigger primitives.
- Durable backend states map to Attachment idle, processing, error, and done
  states without introducing client-side fake progress.
- The existing retry, remove, and open-source actions remain available with
  accessible labels.
- Reduced-motion users receive a static shimmer state instead of continuous
  animation.

## Validation

- Focused Vitest coverage passed: 11 tests across the Project Sources panel and
  project dropzone.
- Targeted ESLint and Prettier checks passed for changed TypeScript files.
- TypeScript type checking passed.
- Production Vite build passed with the existing route-test warning.
- `git diff --check` passed.

## Limitation

The Convex indexing lifecycle exposes phase states, not extraction or embedding
percentages. The scan animation communicates active work only; it is not a
numeric progress indicator. File-format support remains governed by the
existing Project source indexing policy.
