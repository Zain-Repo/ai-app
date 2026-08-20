# Precision-first memory retrieval

## Context

Agent Memory v2 already combined direct selection, Convex full-text search, and
profile-matched vector search. The retrieval action flattened personal and
project result lists before reciprocal-rank fusion, discarded vector similarity
scores, and accepted every nearest neighbor. Long user messages could also
exceed Convex's 16-term full-text search limit, causing optional retrieval to
fall back silently. Retrieved project and personal items with the same canonical
key could be injected together, and retrieved items produced a second quoted
memory header.

Current platform guidance supports a precision gate rather than unconditional
top-k recall:

- [Convex vector search](https://docs.convex.dev/search/vector-search) returns
  cosine similarity scores from -1 to 1 and documents post-search score
  filtering.
- [Convex full-text search](https://docs.convex.dev/search/text-search) returns
  relevance-ranked BM25-style results and accepts at most 16 query terms.
- [OpenAI file search](https://platform.openai.com/docs/guides/tools-file-search)
  exposes both hybrid sparse/dense weighting and a score threshold.
- [LongMemEval](https://arxiv.org/abs/2410.10813) treats abstention, knowledge
  updates, and multi-session reasoning as core long-term-memory abilities.

## Decision

- Keep direct, pinned, confirmed, and sensitive user-approved memory selection
  deterministic and available without provider retrieval.
- Build at most two retrieval queries: the current user turn and a bounded
  three-user-turn context query for short or referential follow-ups.
- Normalize every Convex full-text query to at most 16 unique Unicode terms of
  at most 32 code points.
- Preserve each query-and-scope ranking as an independent list during fusion so
  project results are not penalized for being concatenated after personal
  results.
- Retain dense similarity in weighted reciprocal-rank fusion. Reject vector-only
  candidates below a conservative cosine score of 0.8; lexical matches remain
  eligible, and sparse/dense agreement receives an additive boost.
- Resolve canonical-key conflicts before direct selection and after retrieval.
  Project memory replaces personal memory with the same key for a project
  request.
- Exclude canonical keys already present in deterministic context and append
  retrieved items inside the existing quoted, untrusted memory block.
- Keep the score floor as an explicit policy constant. Change it only with a
  labeled retrieval evaluation; do not make it a user-controlled setting.

## Consequences

- Irrelevant nearest neighbors no longer enter prompts merely because a vector
  index always returns top-k results.
- Long requests no longer disable saved-memory or history-summary lexical
  retrieval by exceeding the search term limit.
- Follow-up questions retain recent conversational retrieval context without
  allowing unbounded history into the embedding request.
- Retrieval performs up to two embedding inputs and up to two lexical queries
  per request. Searches remain bounded to two scopes, eight hits per list, 16
  hydrated candidates, eight selected memory items, and the existing 2,000-token
  memory budget.
- The change requires no schema migration, re-embedding, new provider, or new
  dependency.
