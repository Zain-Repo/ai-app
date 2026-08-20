# OpenRouter memory embeddings now use Qwen3 8B

## Outcome

Memory processing on OpenRouter now embeds with `qwen/qwen3-embedding-8b`
instead of `openai/text-embedding-3-small`. Vectors are still stored in Convex
at 1,536 dimensions so the existing `memorySearchDocuments` index can accept
new documents without a schema reshape.

## Backend

- Pinned the OpenRouter memory policy to Qwen3 Embedding 8B and policy revision
  2. OpenAI memory processing remains `text-embedding-3-small`.
- Memory embed, capture, and retrieval now call a dedicated memory embedding
  helper. Project source indexing still uses the OpenAI small model.
- Qwen responses are truncated from the native 4,096-d space and L2-normalized
  to 1,536-d before Convex insert and vector search.
- Stale OpenRouter profiles are upgraded on Personalization open, on
  `syncProcessingPolicy`, and when a memory job is claimed, then confirmed
  memories are re-queued for embedding.

## Validation

- Unit tests cover policy identity, Matryoshka truncation, and OpenRouter
  embedding settings without a `dimensions` parameter.
- Convex tests cover new profiles storing the Qwen model and upgrading a stale
  OpenRouter profile with a re-embed job.

## Limitations

- Existing OpenRouter semantic hits pause until re-embed jobs finish.
- OpenAI-backed memory processing does not use Qwen.
- Notion Engineering Notes were not updated from this environment.
