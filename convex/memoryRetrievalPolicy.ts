export const MAX_MEMORY_SEARCH_TERMS = 16
export const MAX_MEMORY_SEARCH_TERM_LENGTH = 32
export const MAX_MEMORY_RETRIEVAL_QUERIES = 2
export const MIN_MEMORY_VECTOR_SCORE = 0.8

const MAX_PRIMARY_QUERY_LENGTH = 2_000
const MAX_CONTEXTUAL_QUERY_LENGTH = 6_000
const RECIPROCAL_RANK_CONSTANT = 60

export type MemoryVectorHit<T extends string> = {
  id: T
  score: number
}

export type RetrievedMemoryCandidate = {
  canonicalKey: string
  scope: "user" | "project"
}

function boundedQuery(value: string, maximumLength: number) {
  return Array.from(value.trim()).slice(0, maximumLength).join("")
}

/**
 * Builds a primary current-turn query and one bounded conversational query.
 * The second query helps resolve short follow-ups without allowing old turns to
 * dominate retrieval.
 */
export function buildMemoryRetrievalQueries(
  currentMessage: string,
  recentUserMessages: string[]
) {
  const primary = boundedQuery(currentMessage, MAX_PRIMARY_QUERY_LENGTH)
  if (!primary) return []

  const contextual = boundedQuery(
    recentUserMessages
      .map((message) => message.trim())
      .filter(Boolean)
      .slice(-3)
      .join("\n"),
    MAX_CONTEXTUAL_QUERY_LENGTH
  )

  return contextual && contextual !== primary
    ? [primary, contextual].slice(0, MAX_MEMORY_RETRIEVAL_QUERIES)
    : [primary]
}

/**
 * Convex full-text search accepts at most 16 terms of at most 32 characters.
 * Extracting terms explicitly keeps retrieval available for long user turns
 * instead of allowing the search query to fail and silently fall back.
 */
export function normalizeMemoryLexicalQuery(value: string) {
  const terms = value.match(/[\p{L}\p{N}_]+/gu) ?? []
  const seen = new Set<string>()
  const selected: string[] = []

  for (const term of terms) {
    const bounded = Array.from(term)
      .slice(0, MAX_MEMORY_SEARCH_TERM_LENGTH)
      .join("")
    const identity = bounded.toLowerCase()
    if (!bounded || seen.has(identity)) continue
    seen.add(identity)
    selected.push(bounded)
    if (selected.length >= MAX_MEMORY_SEARCH_TERMS) break
  }

  return selected.join(" ")
}

/**
 * Fuses independent lexical and vector rankings while retaining dense-search
 * confidence. Weak vector-only neighbors are rejected; lexical matches remain
 * eligible, and agreement between retrievers receives a natural rank boost.
 */
export function fuseMemorySearchRankings<T extends string>(args: {
  lexicalRankings: T[][]
  vectorRankings: MemoryVectorHit<T>[][]
  minimumVectorScore?: number
}) {
  const minimumVectorScore = args.minimumVectorScore ?? MIN_MEMORY_VECTOR_SCORE
  const scores = new Map<T, number>()

  for (const ranking of args.lexicalRankings) {
    for (const [index, id] of ranking.entries()) {
      scores.set(
        id,
        (scores.get(id) ?? 0) + 1 / (RECIPROCAL_RANK_CONSTANT + index + 1)
      )
    }
  }

  for (const ranking of args.vectorRankings) {
    for (const [index, hit] of ranking.entries()) {
      if (hit.score < minimumVectorScore) continue
      const confidence =
        minimumVectorScore >= 1
          ? 1
          : 0.5 +
            0.5 *
              Math.min(
                1,
                Math.max(
                  0,
                  (hit.score - minimumVectorScore) / (1 - minimumVectorScore)
                )
              )
      scores.set(
        hit.id,
        (scores.get(hit.id) ?? 0) +
          confidence / (RECIPROCAL_RANK_CONSTANT + index + 1)
      )
    }
  }

  return [...scores.entries()]
    .sort(
      ([leftId, leftScore], [rightId, rightScore]) =>
        rightScore - leftScore || leftId.localeCompare(rightId)
    )
    .map(([id]) => id)
}

/**
 * Applies canonical-key identity after hydration. Project memory replaces a
 * personal value with the same key so contradictory scopes cannot be injected
 * together into one request.
 */
export function deduplicateRetrievedMemory<
  TCandidate extends RetrievedMemoryCandidate,
>(candidates: TCandidate[], excludedCanonicalKeys: ReadonlySet<string>) {
  const selected: TCandidate[] = []
  const indexByKey = new Map<string, number>()

  for (const candidate of candidates) {
    if (excludedCanonicalKeys.has(candidate.canonicalKey)) continue
    const existingIndex = indexByKey.get(candidate.canonicalKey)
    if (existingIndex === undefined) {
      indexByKey.set(candidate.canonicalKey, selected.length)
      selected.push(candidate)
      continue
    }
    if (
      selected[existingIndex]?.scope === "user" &&
      candidate.scope === "project"
    ) {
      selected[existingIndex] = candidate
    }
  }

  return selected
}
