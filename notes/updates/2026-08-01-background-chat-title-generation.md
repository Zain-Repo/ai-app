# Background chat title generation

## Outcome

New chats now receive a short model-generated title that summarizes the initial
user question. Title generation runs independently from the primary response,
so it is not gated by text completion, image completion, or response failure.

## Architecture and provider boundaries

- OpenRouter and OpenAI chats schedule a dedicated Convex background action at
  conversation creation. The action uses the connected provider credential and
  a small title model, separately from the requested response model.
- Desktop Codex chats start a separate ephemeral local Codex turn for the title.
  The renderer does not wait for that turn before starting the primary answer.
- The stored first user message is the immutable title source. Later follow-up
  messages are never used to rename the chat.
- A shared policy limits generated titles to five words and 40 characters and
  removes labels, markdown, multiline output, and ending punctuation.
- The conversation stores the source message and an explicit pending/generated
  state. Server-side validation and compare-and-set behavior prevent malformed,
  duplicate, late, or unauthorized results from overwriting an existing title.
- Desktop title instructions retain the local runtime restriction against file
  inspection, command execution, or filesystem modification.

## Affected areas

- `shared/chat-title.ts`: shared fallback, prompt, normalization, and validation
  policy.
- `convex/schema.ts`: title-generation state and immutable source-message link.
- `convex/conversations.ts`: creation-time scheduling, title context, and guarded
  hosted/desktop title writes.
- `convex/openRouterResponses.ts`: independent OpenRouter/OpenAI title action.
- `src/lib/desktop-chat-title.ts`: independent desktop Codex title turn.
- `src/routes/chat.{-$slug}.tsx`: new-chat desktop title dispatch.
- `convex/conversationTitles.test.ts`, `convex/openRouterResponses.test.ts`, and
  `src/lib/desktop-chat-title.test.tsx`: provider, lifecycle, normalization,
  authorization, failure, and late-result coverage.

## Validation

- Full Vitest suite passed: 35 test files and 150 tests.
- TypeScript type checking passed.
- Scoped ESLint passed for the title-related files.
- Production build passed.
- `git diff --check` passed.

## Known limitation

Provider or title-job failure leaves the initial prompt-based fallback title in
place; title generation is intentionally non-blocking and does not fail the chat.
