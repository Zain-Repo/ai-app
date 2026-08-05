# Expanded Fal image model catalog

## Outcome

Dev3's curated Fal image catalog now supports 24 live text-to-image models,
up from 14. The ten additions cover faster iteration, premium generation,
typography, bilingual prompting, layout-sensitive design, and lower-cost image
workflows without changing how live availability or pricing is discovered.

## Added models

- FLUX.2 Klein 9B, Flash, Turbo, and Max
- Nano Banana Lite
- Ideogram V4
- Qwen Image 2 and Qwen Image 2 Pro
- Seedream 5 Lite
- Reve 2.1

## Affected areas

- `convex/fal.ts`: pairs each new generation endpoint with its verified Fal
  editing endpoint, input field, description, and documented reference limit.
- `convex/fal.test.ts`: locks the curated endpoint set and covers new
  single-image and three-reference editing contracts.

## Reliability and security

- Models are still exposed only when Fal's authenticated live catalog reports
  the curated generation endpoint as active and categorized as text-to-image.
- Pricing remains sourced from Fal's live USD pricing response.
- Existing trusted Fal media URL validation, bounded downloads, polling limits,
  and global ten-reference cap are unchanged.
- Models with stricter documented reference limits reject excess inputs before
  a paid Fal job is submitted.

## Evidence

- Fal's live model catalog and schemas verified every added generation endpoint,
  edit endpoint, required prompt field, image output, and reference input shape.
- `bunx vitest run convex/fal.test.ts`: 1 file and 4 tests passed.
- `bun run test`: 61 files and 277 tests passed.
- `bun run typecheck`: passed.
- `bunx eslint convex/fal.ts convex/fal.test.ts`: passed.
- `bunx prettier --check convex/fal.ts convex/fal.test.ts`: passed.
- `bun run build`: production client and SSR builds passed.

## Limitations

- No paid generation job was submitted, so validation does not include visual
  comparison of model outputs.
- Model availability and pricing remain dependent on Fal and the connected
  user's Fal account.
- The repository-wide Prettier check remains blocked by 166 pre-existing
  unformatted files; both changed TypeScript files pass the scoped check.
