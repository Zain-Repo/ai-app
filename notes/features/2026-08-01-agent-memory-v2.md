# Agent Memory v2

## Problem

Dev3 memory is currently an opt-in, OpenRouter-only key/value feature.
OpenAI, desktop Codex, realtime voice, image generation, and future coding
agents do not receive the same personal context. Capture and embedding failures
are silent, recalled memory is inserted at system priority, and users cannot
review provenance, candidates, processing health, or per-response memory use.

## Implementation

- Add an owner-scoped, revisioned OpenAI or OpenRouter memory processing
  profile that is independent from the active chat provider.
- Introduce versioned memory items, evidence, versions, search documents,
  conversation summaries, jobs, tombstones, and response references.
- Centralize capture and retrieval behind provider-neutral internal services,
  with conservative automatic learning, candidate confirmation, project
  isolation, lifecycle controls, bounded hybrid retrieval, and a 2,000-token
  memory budget.
- Apply memory as quoted user-level reference data across hosted providers,
  desktop Codex, realtime voice, and image generation. Never place learned or
  retrieved memory in system or developer instructions.
- Replace the separate Memory and Preferences dialogs with an accessible
  Personalization center for defaults, saved memory, history, processing
  health, provenance, correction, deletion, undo, and source feedback.
- Dual-read existing memories during migration and process an explicitly
  approved backfill of at most 100 active conversations from the newest 90
  days.

## Acceptance criteria

- The same relevant owner-scoped memory reaches OpenRouter, OpenAI, desktop
  Codex, realtime voice, and image-generation entry points.
- Per-chat `standard`, `read_only`, and `off` modes control memory use and
  capture; `project_only` prevents both personal recall and personal capture.
- Explicit safe durable statements can become active with visible undo;
  inferred, ambiguous, contradictory, or sensitive candidates cannot affect a
  response before confirmation.
- Corrections and forget requests take effect on the next response without
  stale jobs resurrecting deleted content.
- Provider failures degrade transparently without failing chat, and no memory
  content, prompts, vectors, or credentials enter logs or metrics.
- Focused tests, the full test suite, typecheck, lint, client/SSR builds, and
  `git diff --check` pass.

## Security and reliability

- Derive ownership server-side and re-check owner, memory revision, item
  revision, processing-profile revision, content hash, and opt-in state before
  asynchronous commits.
- Always reject credentials, authentication data, account numbers, government
  identifiers, and precise addresses. Sensitive personal facts require an
  explicit confirmation step.
- Store memory context as bounded untrusted user-level reference data.
- Use idempotent jobs with bounded retries and content-free error codes.
- Purge memory artifacts in bounded project and account deletion workflows.

## Validation

- Add unit fixtures for capture policy, conflict precedence, sensitivity,
  correction, forgetting, expiry, and canonical keys.
- Add Convex ownership, migration, job, tombstone, retention, provider-profile,
  and deletion-race tests.
- Add adapter parity and prompt-priority tests plus UI accessibility coverage.
- Run the repository validation and draft-PR Codex review workflow.

## Out of scope

- Organization or shared-team memory.
- Third-party connector memory.
- Arbitrary long-form templates.
- Convex storage of raw coding-agent runtime state.
- App-funded provider credentials.
