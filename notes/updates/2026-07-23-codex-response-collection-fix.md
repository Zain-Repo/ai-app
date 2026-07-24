# Codex response collection fix

## Outcome

Desktop ChatGPT subscription requests now collect completed Codex app-server
items from `item/completed` notifications. This fixes successful Codex turns
being stored as failed responses when the final `turn/completed` notification
contains an empty `items` array.

Failed assistant messages also use their actual provider. Codex failures no
longer display the OpenRouter fallback text, and direct OpenAI failures are
identified separately.

## Root cause

The bundled Codex CLI `0.145.0` completed an authenticated
`gpt-5.6-luna` diagnostic turn successfully and returned `OK` in an
`item/completed` notification. Its later `turn/completed` notification reported
the successful status but no items. AI Harness only read the latter payload and
treated the response as empty.

## Affected areas

- `electron/main/codex-app-server.ts`
- `electron/main/codex-runtime.test.ts`
- `src/routes/chat.{-$slug}.tsx`

## Validation

- Authenticated protocol diagnostic against the exact packaged Codex `0.145.0`
  binary returned `OK`.
- `bun run test` passed: 27 files, 76 tests.
- `bun run typecheck` passed.
- Focused Prettier check passed.
- `bun run build` passed with the existing route-test naming warning.

## Release

Included in the `0.1.9` release source. Existing `0.1.8` installations require
the `0.1.9` update before this fix is active.
