# Project source PDF indexing

## Outcome

Project Sources now recognize PDF uploads and extract embedded text locally
before chunking and embedding. PDF indexing continues to use the project's
pinned OpenAI or OpenRouter embedding profile and its existing 1,536-dimension
embedding policy.

## Affected areas

- Project source type detection accepts `application/pdf` and `.pdf` files.
- The Convex Node indexing action uses local PDF.js-based extraction, retains
  the existing 20 MB and 500,000-character limits, and caps PDFs at 250 pages.
- Source rows distinguish PDFs with no selectable text, PDFs over the page
  limit, and unreadable or password-protected PDFs.
- PDFs saved as unsupported before this change are surfaced as retryable when
  the project already has an embedding provider pinned.

## Validation

- Focused Vitest coverage passed for source policy, PDF extraction, corrupted
  and image-only behavior, project ownership, and source-row feedback.
- TypeScript type checking and targeted ESLint checks passed.
- The Convex Node action bundled locally with the PDF dependency.
- A production Vite build passed with the existing route-test warning.

## Limitation

OCR is not included. Scanned or image-only PDFs must be converted to searchable
PDFs before upload. Corrupted and password-protected PDFs are rejected without
exposing parser details.
