# Model-aware image generation workspace

## Summary

Replace the chat-style image composer with a dedicated image studio that adapts
its controls to the selected Fal or OpenRouter model, supports multiple outputs
from one prompt, and keeps every output independently actionable.

## Implementation

1. Define one versioned capability contract for dimensions, output count,
   references, resolution, format, quality, background, seed, style, prompt
   expansion, and pricing.
2. Use reviewed Fal capability records and OpenRouter's per-endpoint image model
   descriptors. Intersect endpoint capabilities for automatic routing and pin
   them when the user chooses a host.
3. Persist generation sets, attempts, and output slots separately from chat
   messages so queued, running, partial, complete, failed, and canceled states
   are durable.
4. Generate and store up to four native provider outputs in one request, index
   successful outputs in Library, and preserve lineage between the Library
   asset and its generation output.
5. Add a responsive studio with a desktop settings rail, compact mobile
   settings disclosure, ordered references, result grids, detail preview,
   download, reuse, cancel, retry, and use-as-reference actions.
6. Keep legacy image messages readable and retain the old composer behind the
   `VITE_IMAGE_STUDIO_V2=false` client rollback switch.

## Acceptance criteria

- Controls expose only values supported by the selected model and route.
- Switching capability records resets incompatible draft values with a visible
  notice.
- A single prompt may request one to four outputs within both provider and app
  limits.
- Each output has an honest persisted state; the UI never fabricates a
  completion percentage.
- PNG, JPEG, and WebP references are ownership-checked and bounded by the
  selected model.
- Successful outputs are downloadable, reusable, available in Library, and can
  become a new reference.
- Cancellation and retry are owner-only and resilient to late provider writes.
- Existing image conversations remain readable without a data migration.
- Desktop and mobile layouts preserve labels, keyboard focus, live regions,
  touch targets, and reduced-motion behavior.

## Security and reliability constraints

- Reload and validate the capability server-side immediately before both
  request creation and provider execution.
- Accept only owned connected provider records and owned draft attachments.
- Bound prompts, references, outputs, response bytes, provider URLs, polling,
  and idempotency keys.
- Store no provider credentials or base64 output payloads in the generation
  records.
- Use additive Convex tables and optional lineage fields; no destructive
  migration is required.

## Validation

- Capability/config unit tests and OpenRouter endpoint intersection tests.
- Fal and OpenRouter request/response tests, including native multi-output.
- Convex generation-set ownership, idempotency, output-slot, and cancellation
  tests.
- Image settings, Library, and honest progress-state component tests.
- TypeScript, full Vitest, production build, scoped lint/format, and diff checks.

## Out of scope

- Canvas editing, masking, layers, or inpainting brushes
- Arbitrary provider-specific passthrough parameters
- More than four stored outputs per prompt
- SVG output rendering
- Destructive backfill of legacy image messages

## Research references

- [OpenRouter image generation](https://openrouter.ai/docs/guides/overview/multimodal/image-generation)
- [Fal FLUX.2](https://fal.ai/models/fal-ai/flux-2/api)
- [Fal Nano Banana 2](https://fal.ai/models/fal-ai/nano-banana-2/api)
- [Fal GPT Image 1.5](https://fal.ai/models/fal-ai/gpt-image-1.5/api)
- [Fal Seedream 4.5](https://fal.ai/models/fal-ai/bytedance/seedream/v4.5/text-to-image/api)
