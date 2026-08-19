# Memory retrieval precision

## Outcome

Improved Agent Memory v2 retrieval so weak semantic neighbors are rejected,
personal and project rankings are fused fairly, and long user turns stay within
Convex full-text search limits. Project-scoped values now consistently replace
personal values with the same canonical key, and each request receives one
coherent quoted memory block.

## Affected areas

- `convex/memoryRetrievalPolicy.ts`: adds bounded query construction, Unicode
  lexical normalization, score-aware reciprocal-rank fusion, and canonical-key
  scope resolution.
- `convex/memoryContext.ts`: uses current-turn and recent-context retrieval
  queries, preserves per-scope lexical rankings, applies full-text limits to
  saved memory and history summaries, and filters search documents against
  canonical keys already selected for deterministic context.
- `convex/memoryActions.ts`: batches query embeddings, gates vector-only hits at
  cosine score 0.8, fuses independent rankings, removes conflicting candidates,
  and appends results without duplicating the untrusted-memory header.
- `convex/memoryRetrievalPolicy.test.ts`: covers query bounds, term limits,
  weak-hit rejection, retriever agreement, score ordering, project precedence,
  and prompt formatting.

## Security and reliability

- Existing owner, scope, confirmation, sensitivity, revision, budget, and
  rollout checks remain in force.
- The provider-backed retrieval path still degrades to deterministic direct
  context on failure and does not log queries, memory content, vectors, or
  credentials.
- No schema, credential, dependency, retention, or rollout-default change was
  made.

## Validation

- Convex code generation completed successfully.
- Targeted ESLint passed for all changed TypeScript files.
- TypeScript checking passed.
- Focused memory validation passed: 7 test files and 46 tests.
- The production client and SSR build passed with the existing warning that
  `src/routes/chat-sidebar.test.tsx` is discovered as a route file.
- The full suite passed 340 of 341 tests. The unrelated Personalization center
  test exceeded its five-second timeout under full-suite load; its isolated
  rerun passed all 3 tests in 4.19 seconds.
- Repository-wide ESLint still reports the existing checked-in skill-template,
  generated-file, and UI backlog. The one newly reported naming issue was fixed,
  and targeted ESLint then passed.
- Repository-wide Prettier checking still reports the existing 206-file
  formatting backlog. All changed source and test files pass targeted Prettier
  checking.
