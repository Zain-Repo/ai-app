# Landing theme and motion refresh

## Outcome

- Replaced the landing page's gold-tinted cinematic palette with a cool,
  mineral-neutral light and dark system.
- Added a persisted light/dark control backed by the existing `next-themes`
  dependency, with system preference as the initial default.
- Reduced hero and scroll movement, added a restrained word entrance, and kept
  the existing Motion and Remotion reduced-motion paths.
- Neutralized the existing landing imagery and updated the Remotion routing reel
  to use a cool blue signal color.
- Kept the mobile header usable by hiding the secondary sign-in action and
  retaining accessible names for the icon-only theme controls.

## Affected areas

- `src/routes/__root.tsx`
- `src/routes/index.tsx`
- `src/styles.css`
- `src/components/landing/landing-routing-player.tsx`
- `src/remotion/HarnessRoutingReel.tsx`

## Validation

- `bun run typecheck`
- Targeted ESLint for the changed TypeScript and TSX files
- `bun run test`: 26 files and 72 tests passed
- `bun run build`: client and SSR builds completed
- Browser checks at 1440px and 390px in light and dark mode confirmed theme
  switching, persisted selection, completed scroll reveals, and zero horizontal
  overflow

## Known limitation

- Local browser verification reports the existing Clerk production-domain
  restriction on `localhost`; the public landing page still rendered and was
  visually verified.
