# Key Page Dependency Trees

## `/chat/` â€” Image Studio workspace

Entry: `src/routes/chat.{-$slug}.tsx`

Dependencies:
- `src/routes/chat.{-$slug}.tsx`
  - `src/components/image-workspace/image-workspace.tsx`
    - `src/components/image-workspace/image-settings.tsx`
      - `src/components/ui/input.tsx`
      - `src/components/ui/native-select.tsx`
    - `src/components/image-workspace/generation-set.tsx`
      - `src/components/ui/button.tsx`
      - `src/components/ui/dialog.tsx`
      - `src/components/library-workspace.tsx`
    - `src/components/image-workspace/reference-strip.tsx`
      - `src/components/ui/button.tsx`
    - `src/components/ui/textarea.tsx`
    - `src/hooks/use-image-generation-draft.ts`
  - `src/components/sidebar-workspace-switcher.tsx`
  - `src/components/sidebar-user-menu.tsx`
  - `src/components/ui/sidebar.tsx`
  - `src/components/ui/ai-input.tsx`
  - `src/components/ui/dialog.tsx`
  - `src/components/ui/dropdown-menu.tsx`
  - `src/components/ui/select.tsx`
  - `src/styles.css`

## `/` â€” Landing page

Entry: `src/routes/index.tsx`

Dependencies:
- `src/routes/index.tsx`
  - `src/components/dev3-logo.tsx`
  - `src/components/landing/landing-routing-player.tsx`
  - `src/components/ui/button.tsx`
  - `src/remotion/Dev3RoutingReel.tsx`
  - `src/styles.css`

## `/desktop` â€” Desktop entry

Entry: `src/routes/desktop.tsx`

Dependencies:
- `src/routes/desktop.tsx`
  - `src/components/desktop-updater.tsx`
  - `src/routes/chat.{-$slug}.tsx` through application navigation
  - `src/styles.css`

## Authentication routes

- `src/routes/sign-in.$.tsx`
  - `src/components/auth-page.tsx`
- `src/routes/sign-up.$.tsx`
  - `src/components/auth-page.tsx`
- `src/routes/desktop.sign-in.$.tsx`
  - `src/components/auth-page.tsx`
- `src/routes/desktop.sign-up.$.tsx`
  - `src/components/auth-page.tsx`
