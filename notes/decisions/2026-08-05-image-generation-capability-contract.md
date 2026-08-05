# Image generation capability contract

## Decision

Image generation controls and provider payloads are governed by one versioned
`ImageModelCapability` contract. Fal uses reviewed static records for the
curated endpoints. OpenRouter loads its dedicated image endpoint descriptors at
runtime and intersects them when automatic routing is selected.

The server reloads the capability and compares its revision before accepting a
generation and again before execution. Unsupported or changed parameters fail
closed instead of being silently sent to a provider.

## Rationale

Image providers do not share a stable set of aspect ratios, resolution tiers,
output counts, reference limits, formats, or advanced controls. A generic form
would either expose settings that fail at runtime or omit meaningful model
features. Keeping one contract shared by UI validation and provider adapters
prevents those layers from drifting.

## Consequences

- New Fal models require a reviewed capability entry in addition to catalog
  inclusion.
- OpenRouter automatic routing exposes only the intersection supported by every
  eligible endpoint; choosing a host can expose a broader pinned capability.
- The application caps each prompt at four outputs even when a provider allows
  more.
- Vector-only OpenRouter endpoints are rejected until the product explicitly
  supports SVG output.
- Capability revision changes require the user to review refreshed settings and
  submit again.
- The persistence model stores the exact config and revision used for each set,
  making retries and support investigations reproducible.

## Alternatives considered

- A universal lowest-common-denominator form was rejected because it hides
  useful controls and still cannot model provider count semantics correctly.
- Passing arbitrary form fields directly to providers was rejected because it
  weakens validation and makes routing failures unpredictable.
- One assistant message per output was rejected because a single prompt is one
  generation set and needs grouped status, cancellation, and comparison.
