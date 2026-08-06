# Dev3 Image Studio — Clean OpenAI-Inspired Direction

## Product context

Dev3 Image Studio is a desktop-first workspace for prompting image models, selecting providers and model capabilities, attaching ordered reference images, configuring output options, monitoring generation, and revisiting completed results. The redesign must preserve the current feature set while making the workflow calmer, clearer, and easier to scan.

Primary jobs:

- Compose an image prompt without visual distraction.
- Choose provider, model, route, aspect ratio, resolution, count, and format.
- Add and reorder reference images.
- Understand queued, generating, partial, failed, and completed states.
- Reuse prompts, retry work, use a result as a reference, and download outputs.
- Review prior generations in the same thread.

## Required screen set

1. Create — empty workspace with prompt composer, model controls, settings, references, and a clear result-stage empty state.
2. Generating — active job with honest indeterminate progress, elapsed time, cancel action, and reserved output tiles.
3. Results and history — completed outputs with metadata, reuse/download/reference actions, and earlier generation groups.

## Visual direction

The interface should feel like a focused professional tool: quiet, engineered, and confident. Use flat surfaces, strong alignment, modest borders, and abundant whitespace. Do not introduce decorative illustration, gradients, glass effects, oversized marketing typography, or gratuitous cards.

### Color

- Canvas: `#FFFFFF`.
- Subtle surface: `#F7F7F8`.
- Secondary surface: `#EFEFF1`.
- Primary text: `#111111` for accessible sustained reading.
- Secondary text: `#68686F`.
- Border: `#E1E1E5`.
- Strong border: `#C9C9CF`.
- Brand/accent: `#8E8EA0`.
- Text on accent: `#FFFFFF`.
- Focus outline: `#111111`, 2px with 2px offset.
- Error: restrained deep red; warning: restrained amber; success: restrained green. Status must never rely on color alone.

The supplied `#8E8EA0` is an accent, not body text. Primary reading text must remain `#111111` to satisfy WCAG contrast.

### Typography

- Use `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` only.
- Display: 48px / 700 / 1.2, used rarely.
- Page heading: 32px / 600 / 1.25.
- Section heading: 20–24px / 600 / 1.35.
- Body: 16px / 400 / 1.5.
- UI label: 13–14px / 500–600 / 1.35.
- Supporting text: 12–13px / 400 / 1.45.
- Avoid decorative or serif typography and avoid all-caps except short metadata labels.

### Spacing and geometry

- Strict 8px base grid: 8, 16, 24, 32, 40, 48, and 64px.
- Radius: 5px for controls and containers. Do not use pill shapes except status chips where semantically useful.
- Minimum interactive target: 44×44px.
- Desktop canvas: design at 1440×960.
- Recommended structure: 232px global navigation, 376–400px creation panel, flexible results stage.
- Use 1px borders for grouping; avoid shadows. If separation is otherwise impossible, use only a faint 1px ambient shadow.

### Components

- Navigation: compact icon-and-label rows with one clear active state.
- Prompt composer: visually dominant control in the creation panel, 140–180px tall, with character/help metadata below.
- Select controls: rectangular, consistent 44px height, visible labels, clear chevron.
- Aspect ratio: small outlined selectors that preview the shape and include text labels.
- Primary action: dark or muted-purple-gray fill with white label, full-width in the creation panel.
- Secondary actions: white or transparent with visible border.
- Result tiles: image-first, quiet border, minimal chrome; reveal secondary actions without hiding essential keyboard access.
- Progress: indeterminate motion with accompanying text and elapsed time. Never invent a percentage when the provider does not report one.
- Empty state: centered, concise, instructional, and free of decorative artwork.

### Motion

- Standard duration: 400ms with `ease`.
- Motion should clarify state changes, selection, loading, and result arrival.
- No bounce or spring behavior.
- Respect `prefers-reduced-motion`; replace continuous animation with a static status treatment.

### Accessibility

- Preserve semantic labels for provider, model, prompt, references, and settings.
- Keep focus indicators visible on every interactive element.
- Do not communicate status through color alone.
- Maintain keyboard ordering from global navigation to creation controls, generation action, then results.
- Ensure hover-only image actions remain available by keyboard and through a visible overflow or action row.

## Design constraints

- Preserve the real Dev3 image-generation information architecture and all meaningful controls from the source context.
- Use only the fonts, colors, spacing, and component styles defined in this document.
- Do not introduce any unlisted font, color, gradient, glass treatment, or decorative visual style.
- The three screens must clearly belong to one product and share the same navigation, creation panel, and results-stage geometry.
