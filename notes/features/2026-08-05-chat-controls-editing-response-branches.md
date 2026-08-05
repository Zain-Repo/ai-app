# Chat controls, editing, and response branches

## Summary

Add durable response controls to chat: stop active generation, copy raw message
text, edit and resend historical prompts, retry assistant responses, choose a
same-provider retry model, and navigate persisted response branches.

## Implementation

1. Extend the Convex schema with root and child conversation branches, active
   branch selection, stopped responses, and scheduled-generation identifiers.
2. Resolve every transcript and generation context from a bounded selected
   branch path without rewriting legacy messages.
3. Add owner-checked, stale-branch-safe stop, edit, retry, and branch-selection
   mutations.
4. Cooperatively abort hosted text, tool, OpenRouter image, and Fal image
   requests, while treating intentional stops separately from provider errors.
5. Interrupt desktop Codex turns through a request-scoped, renderer-owned
   optional bridge.
6. Reuse AI Elements message actions and controlled branch controls in an
   extracted chat message row, and add generation and edit states to the
   composer.

## Acceptance criteria

- Stop preserves partial output, closes running terminal entries, cancels
  pending schedules, and ignores late stream or finalizer writes.
- User messages provide Copy and Edit. Terminal assistant responses provide
  Copy when text exists, Retry, a same-provider model menu, and branch
  navigation.
- Editing retains the original attachment references and can be cancelled
  without losing the draft that was already in the composer.
- Retry defaults to the original provider, model, routing, and effort.
- Branch selection survives reload and rejects stale, unauthorized, active
  generation, cross-provider, and over-limit operations.
- Controls remain keyboard accessible, touch-visible, focus-visible, and
  announced through a stable polite live region.

## Security and reliability constraints

- All branch and response mutations verify conversation ownership.
- Reads and writes remain bounded by the 200-message conversation limit.
- Only the renderer that originated a desktop request may interrupt it.
- Attachment storage deletion is deduplicated across branches.
- Clipboard failures must never announce a successful copy.

## Validation

- Targeted Convex, composer, message-row, AI Element, route, and preload tests.
- Formatting, ESLint, TypeScript, full tests, production build, and the local
  desktop Codex smoke test where the runtime is available.

## Out of scope

- Branch merging or deletion
- Cross-provider retry
- Changing attachments while editing a historical prompt
- Generic response feedback controls
