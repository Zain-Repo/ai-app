# Chat experience polish

## Outcome

The Chat composer now has a softer, more tactile visual hierarchy without
changing its message, attachment, provider, editing, or generation behavior.
The primary composer surface is slightly rounder, keyboard focus is easier to
see, controls have restrained hover and press feedback, and starter suggestions
feel more deliberate at compact and desktop widths.

Legacy Chat-only radius overrides now recognize explicit composer and control
hooks, so the component's intended geometry is no longer flattened to the
application's older five-pixel radius. The send-state wash uses semantic theme
colors instead of a decorative rainbow treatment.

## Affected areas

- `src/components/ui/ai-input.tsx`
- `src/components/ui/ai-input.test.tsx`
- `src/components/ai-suggested-actions.tsx`
- `src/styles.css`

## Implementation notes

- Added semantic data hooks for the composer surface, toolbar, textarea, and
  controls.
- Added reduced-motion-safe focus, hover, and press transitions.
- Modernized related TypeScript collection types with read-only inputs and
  improved class composition.
- Added tests for the semantic accessibility contract and the `Ctrl+U`
  attachment shortcut.

## Validation

- Focused Chat and composer tests: 36 tests passed across five files.
- Targeted ESLint and TypeScript type checking passed.
- Production client and SSR builds passed.
- Manual smoke checks covered the authenticated dark-theme Chat view at desktop
  and 320-pixel widths, including keyboard focus and horizontal overflow.
- The full test run passed 325 of 326 tests. One unrelated personalization test
  timed out once and passed all three tests on immediate focused rerun.

## Known limitations

- The large Chat route and custom menu implementations were intentionally left
  unchanged to keep this polish focused and low risk.
- Manual visual validation did not cover the light theme or every intermediate
  viewport size.
