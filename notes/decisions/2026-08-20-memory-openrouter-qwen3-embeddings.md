# OpenRouter memory embeddings use Qwen3 8B

## Context

Memory processing billed through user-owned OpenRouter OAuth was pinned to
`openai/text-embedding-3-small` at 1,536 dimensions. That model is inexpensive
but weaker on retrieval benchmarks than current embedding specialists, and it
keeps memory quality tied to OpenAI even when the user pays OpenRouter.

OpenRouter currently lists `qwen/qwen3-embedding-8b` at about $0.01 per million
tokens versus $0.02 for text-embedding-3-small, with a 32k context window and
Matryoshka output up to 4,096 dimensions. Native OpenRouter providers do not
reliably honor a `dimensions` request, so a 4,096 vector can arrive even when
the Convex index is 1,536.

Project source embeddings remain a separate pinned profile and stay on
`openai/text-embedding-3-small`.

## Decision

- Pin OpenRouter memory extraction to `openai/gpt-4o-mini` and memory embeddings
  to `qwen/qwen3-embedding-8b`.
- Keep the Convex `memorySearchDocuments` vector index at 1,536 dimensions.
- Do not send OpenRouter `dimensions` for Qwen requests (`require_parameters`
  would otherwise fail closed). Truncate native vectors to the first 1,536
  values and L2-normalize them before insert and query.
- Keep the OpenAI memory path on `text-embedding-3-small` at 1,536 dimensions.
- Treat a model, extraction, or dimension mismatch as a stale processing
  profile: bump `policyRevision`, rewrite profile metadata, and re-embed
  confirmed normal memories. Search scope already includes the revision, so old
  and new vector spaces are not mixed.

## Consequences

- OpenRouter Personalization shows `qwen/qwen3-embedding-8b` and 1,536
  dimensions after policy sync.
- Existing OpenRouter memory vectors become unsearchable until re-embed jobs
  complete; lexical and confirmed direct memory stay available.
- Project source indexes are unchanged.
