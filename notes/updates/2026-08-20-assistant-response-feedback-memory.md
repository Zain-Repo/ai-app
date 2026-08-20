# Assistant response feedback and memory aggregation

Date: 2026-08-20

## Summary

Added like/dislike controls to completed assistant responses in chat and wired them to Convex-backed feedback storage. Positive and negative ratings are aggregated into durable workstyle memory items so future responses can reflect what the user liked or disliked.

## Changes

- Added `assistantResponseFeedback` table and `responseFeedback` Convex module with `listConversation` and `submit` APIs.
- Aggregated helpful/unhelpful response excerpts into `workstyle.response_likes` and `workstyle.response_dislikes` memory items when saved memory is enabled.
- Extended `ChatMessageRow` with thumbs up/down actions beside copy/retry controls.
- Wired chat `MessageArea` to load conversation feedback and submit rating toggles.

## Validation

- `npm test -- convex/responseFeedback.test.ts src/components/chat-message-row.test.tsx`
- `npm run typecheck`
