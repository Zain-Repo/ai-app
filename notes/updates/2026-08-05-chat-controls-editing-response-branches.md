# Chat controls, editing, and response branches

## Outcome

Implemented persistent chat branches with user prompt editing, assistant retry,
same-provider model retry, branch selection, raw-text copy actions, and stop
controls for hosted and desktop generation.

## Key decisions

- Legacy conversations stay linear until the first edit or retry; their message
  documents are not rewritten.
- New conversations receive a root branch, while edits and retries create
  immutable child variants.
- Desktop cancellation is runtime-optional so an updated renderer remains
  compatible with older desktop builds.
- Lightweight message actions and branch controls live separately from the
  Streamdown renderer and remain re-exported by the original AI Element module.

## Affected areas

- Convex conversation schema, transcript resolution, mutations, generation, and
  Fal/OpenRouter cancellation
- Electron Codex app-server, IPC ownership, preload bridge, and desktop types
- AI Elements message controls, chat message rows, and the AI composer
- Chat route orchestration and accessibility announcements

## Validation

- Targeted Vitest suites cover branch persistence and guards, stopped-response
  immutability, composer stop/edit behavior, copy reporting, controlled branch
  navigation, existing chat rendering, and preload request forwarding.
- Targeted ESLint and broader validation are recorded in the implementation
  handoff; concurrent image-workspace work may affect repository-wide checks.

## Known limitations

- A provider may charge for work completed before cooperative cancellation
  reaches it.
- Older desktop builds persist the stopped state and ignore late completion but
  cannot interrupt an already-running Codex turn.
- Branch merging, cross-provider retry, historical attachment editing, branch
  deletion, and generic feedback controls remain out of scope.

