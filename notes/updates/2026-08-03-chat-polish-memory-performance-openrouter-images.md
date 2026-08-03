# Chat polish, memory-source batching, and OpenRouter images

## Outcome

The core chat workspace has clearer surface separation and message readability,
with less routine motion and safer mobile composer spacing. Memory provenance now
uses one conversation-scoped reactive query instead of one query per completed
assistant message. OpenRouter image requests now use the provider's compatible
minimal payload and persist omitted-media-type raster responses as PNG.

## Root causes

- Every completed assistant message mounted its own
  `memories.listResponseSources` subscription. A conversation with `N` completed
  assistant messages therefore created `N` client subscriptions and `N` indexed
  backend queries.
- Image generation always sent optional `n`, `size`, and `output_format` fields
  while provider routing required parameter compatibility. OpenRouter image
  parameters are model- and endpoint-specific, so those defaults could exclude
  every endpoint for an otherwise valid image model.
- OpenRouter omits `media_type` for its normal raster PNG response. The parser's
  WebP fallback mislabeled those bytes and their persisted attachment extension.

## Affected areas

- `src/routes/chat.{-$slug}.tsx` and `src/styles.css`: refine the header,
  composer, empty state, assistant reading measure, generated-image boundary,
  and remove repeated message-entry animation while preserving existing tokens,
  focus behavior, responsiveness, and reduced-motion handling.
- `convex/memories.ts`: add the compatible, owner-authorized
  `listConversationResponseSources` query using the existing
  `by_conversation_id` index and a 2,000-reference ceiling derived from the
  200-message and 10-source-per-response limits. The existing per-message API
  remains available.
- `src/routes/chat.{-$slug}.tsx`: subscribe once per selected conversation,
  memoize sources by response message ID, and keep source feedback behavior.
- `convex/openRouterResponses.ts`: send only required image fields unless a
  reference image or provider selection is explicitly present, and default an
  omitted response media type to PNG before storing the attachment.
- `convex/memorySources.test.ts` and
  `convex/openRouterResponses.test.ts`: cover grouped owner-only provenance,
  legacy API compatibility, the minimal mocked image request, and the omitted
  media-type PNG response.

## Evidence

- Memory provenance changes from `N` subscriptions and `N`
  `by_response_message_id` reads to one subscription and one
  `by_conversation_id` read for a selected conversation.
- Focused coordinator validation passed: 5 test files and 60 tests covering the
  chat route, memory batching, existing memory behavior, OpenRouter request and
  response handling, and provider catalog parsing.
- TypeScript checking passed after UI and batching integration.
- The complete Vitest suite passed: 48 files and 224 tests.
- The production client and SSR build passed, with the existing warning that
  `src/routes/chat-sidebar.test.tsx` is discovered as a route file.
- The required repository-wide lint command was attempted and reported 45
  errors and 9 warnings in files outside this update, primarily checked-in
  skill templates, generated Convex files, and existing UI components. None of
  the changed source or test files was reported by ESLint.
- The required repository-wide Prettier check was attempted and reported the
  existing broad formatting backlog (242 files); no formatting sweep was made.
- `git diff --check` passed.
- OpenRouter's official Image API documentation confirms that `model` and
  `prompt` are the required request fields, optional parameter support varies by
  model and endpoint, and raster PNG responses can omit `media_type`.

## Known limitations

- No paid or credentialed OpenRouter generation call was made. The failure and
  corrected request are exercised with a mocked HTTP response.
- Reference-image requests still require the selected model or pinned endpoint
  to support `input_references`; provider rejection remains the correct behavior
  when it does not.
- Authenticated visual QA was not performed; the existing production-key Clerk
  setup does not provide a safe local development account for this worktree.
