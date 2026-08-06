# Extractable Superdesign Components

## SidebarWorkspaceSwitcher
- Source: `src/components/sidebar-workspace-switcher.tsx`
- Category: layout
- Description: Product/workspace selector at the top of the application sidebar.
- Extractable props: `currentWorkspace` (string), `disabled` (boolean).
- Hardcoded: product labels, icons, spacing, menu treatment.

## SidebarUserMenu
- Source: `src/components/sidebar-user-menu.tsx`
- Category: layout
- Description: Persistent account and settings menu at the bottom of the sidebar.
- Extractable props: `userName` (string), `userEmail` (string), `open` (boolean).
- Hardcoded: account actions, icons, menu geometry.

## ImageWorkspace
- Source: `src/components/image-workspace/image-workspace.tsx`
- Category: layout
- Description: Two-column image-generation workspace containing controls, prompt composition, settings, references, empty state, and results history.
- Extractable props: `generationState` (string), `provider` (string), `modelId` (string), `archived` (boolean), `disabled` (boolean).
- Hardcoded: information architecture, section labels, responsive 380px control column, empty-state language.

## GenerationSet
- Source: `src/components/image-workspace/generation-set.tsx`
- Category: basic
- Description: Reusable result group with prompt metadata, output grid, status states, and actions.
- Extractable props: `status` (string), `retryDisabled` (boolean), `outputCount` (number).
- Hardcoded: action icons, metadata layout, modal structure.

## ReferenceStrip
- Source: `src/components/image-workspace/reference-strip.tsx`
- Category: basic
- Description: Ordered image-reference strip with upload, remove, and reorder affordances.
- Extractable props: `limit` (number), `disabled` (boolean), `referenceCount` (number).
- Hardcoded: iconography, 64px thumbnails, ordering help text.

## Button
- Source: `src/components/ui/button.tsx`
- Category: basic
- Description: Shared action primitive with visual and size variants.
- Extractable props: `variant` (string), `size` (string), `disabled` (boolean).
- Hardcoded: variant classes and icon geometry.
