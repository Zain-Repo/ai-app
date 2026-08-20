---
name: Dev3
description: A calm, model-flexible AI workspace with quiet surfaces and focused actions.
colors:
  sage-signal: "#4f8463"
  warm-paper: "#fbfbfa"
  pure-surface: "#ffffff"
  deep-ink: "#111312"
  quiet-copy: "#656a66"
  soft-fog: "#f4f5f3"
  sidebar-linen: "#f7f7f6"
  sage-wash: "#e8ece8"
  hairline: "#dedfdd"
  danger: "#b42318"
typography:
  display:
    fontFamily: "Inter Variable, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Inter Variable, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Inter Variable, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Inter Variable, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Inter Variable, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.5
rounded:
  base: "12px"
  control: "14px"
  surface: "16px"
  composer: "24px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.deep-ink}"
    textColor: "{colors.warm-paper}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "12px 16px"
    height: "48px"
  button-accent:
    backgroundColor: "{colors.sage-signal}"
    textColor: "{colors.pure-surface}"
    rounded: "{rounded.pill}"
    size: "44px"
  input-search:
    backgroundColor: "{colors.pure-surface}"
    textColor: "{colors.deep-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
    height: "44px"
  card:
    backgroundColor: "{colors.pure-surface}"
    textColor: "{colors.deep-ink}"
    rounded: "{rounded.surface}"
    padding: "20px"
  composer:
    backgroundColor: "{colors.pure-surface}"
    textColor: "{colors.deep-ink}"
    rounded: "{rounded.composer}"
---

# Design System: Dev3

## Overview

**Creative North Star: "The Quiet AI Desk"**

Dev3 should feel like a clear, composed workspace that recedes until the user needs it. The visual system uses warm near-white planes, soft dividers, restrained green signals, and a single sans-serif family to keep attention on the conversation and the work around it.

The system is information-rich without becoming dense: the sidebar carries navigation and history, while the main stage preserves generous empty space and anchors the primary input near the bottom edge. Controls are refined and restrained, with outline icons and gently curved geometry rather than decorative effects.

**Key Characteristics:**

- Warm neutral surfaces with a sparse sage accent.
- Inter Variable across display, body, and interface roles.
- An 8px spacing rhythm with compact 4px refinements.
- Flat surfaces separated by tone and hairline borders.
- Outline icons with consistent 1.75–1.8px strokes.

## Colors

The palette is primarily neutral; sage is a functional signal for focus, selection, success, and send actions.

### Primary

- **Sage Signal:** Used for enabled AI actions, focus rings, charts, and small brand-adjacent highlights.

### Neutral

- **Warm Paper:** The default application canvas.
- **Pure Surface:** Inputs, cards, popovers, and the composer.
- **Deep Ink:** Primary text and the high-contrast new-chat action.
- **Quiet Copy:** Secondary labels, hints, and supporting descriptions.
- **Soft Fog:** Muted states and low-contrast fills.
- **Sidebar Linen:** The navigation rail background.
- **Sage Wash:** Active and hovered navigation rows.
- **Hairline:** Borders and structural dividers.

### Named Rules

**The Sparse Signal Rule.** Sage marks action or state; it does not become a decorative field.

**The Warm Canvas Rule.** Major workspace surfaces stay warm-neutral rather than cool gray or stark blue-white.

## Typography

**Display Font:** Inter Variable (with Inter and system sans-serif fallbacks)  
**Body Font:** Inter Variable (with Inter and system sans-serif fallbacks)

**Character:** Clear, contemporary, and compact. Weight and spacing create hierarchy without introducing a separate display personality.

### Hierarchy

- **Display** (600, 2.25rem, 1.1): Empty-state greetings and rare top-level statements.
- **Headline** (600, 1.5rem, 1.2): Major surface headings below the hero level.
- **Title** (600, 1rem, 1.5): Workspace headers, card names, and prominent list labels.
- **Body** (400, 1rem, 1.5): Conversation copy and explanatory text; keep instructional lines compact.
- **Label** (500, 0.8125rem, 1.5): Buttons, metadata, and small controls.

### Named Rules

**The One Family Rule.** Use Inter Variable for product UI and display roles; create contrast through scale, weight, and tracking.

**The Sentence Case Rule.** Navigation and section labels use natural sentence case, not tracked all-caps kickers.

## Layout

Desktop workspaces use a two-pane structure: a 19.5rem sidebar and a flexible main stage. The sidebar groups brand and creation controls at the top, navigation and recent work in the scrollable middle, and identity or settings at the bottom. The main header is 4.75rem high, while the composer is centered in a container up to 64rem wide.

The system follows an 8px rhythm with 4px and 12px refinements. Empty states use generous vertical space and never compete with the composer. At mobile widths, the sidebar becomes an off-canvas sheet, the header contracts to 3.75rem, and the empty state shifts upward so the input remains immediately reachable.

## Elevation & Depth

The system is flat by default. Background tone, borders, and spacing establish hierarchy. Shadows are ambient and sparse: the composer receives a soft low-contrast lift, dialogs receive a diffuse modal shadow, and the primary sidebar action may use a tiny grounding shadow.

### Shadow Vocabulary

- **Composer lift** (`0 14px 34px -28px color-mix(in oklch, var(--foreground) 34%, transparent)`): Separates the anchored composer from the stage without making it float dramatically.
- **Dialog lift** (`0 24px 64px -36px rgba(0,0,0,0.42)`): Reserved for modal layers.

### Named Rules

**The Flat-by-Default Rule.** Resting surfaces use borders or tonal contrast; shadow is reserved for anchored inputs and modal depth.

## Shapes

Controls use gently curved 12–14px corners, cards and dialog surfaces use 16px corners, and the chat composer uses a 24px container radius. Circular or pill geometry is limited to icon actions, chips, and compact controls. Thin 1px borders keep the form language precise.

## Components

### Buttons

- **Shape:** Gently curved controls with a 14px system radius.
- **Primary:** Deep ink on warm paper, 48px high, with medium-weight label text.
- **Accent:** Sage circular or pill action for send and compact positive actions.
- **Hover / Focus:** 150ms color transitions, a subtle opacity shift, and a visible sage focus ring.
- **Secondary / Ghost:** Neutral or transparent surfaces with tonal hover fills; no resting shadow.

### Cards / Containers

- **Corner Style:** Soft 16px corners.
- **Background:** Pure surface against warm paper or sidebar linen.
- **Shadow Strategy:** Flat at rest.
- **Border:** One-pixel hairline.
- **Internal Padding:** 16–24px depending on density.

### Inputs / Fields

- **Style:** Pure-surface fill, hairline border, 14px corners, and readable 14–16px text.
- **Focus:** Sage border and a low-opacity 2px ring.
- **Error / Disabled:** Destructive border and ring for errors; reduced opacity with blocked interaction for disabled controls.

### Navigation

Sidebar rows are 36px or 44px high with 14px sentence-case labels and 18px outline icons. Active rows use Sage Wash without a shadow. The sidebar collapses to an icon rail on desktop and becomes an off-canvas sheet on mobile.

### Chat Composer

The composer is a wide, white, 24px-radius surface anchored near the bottom of the stage. Internal actions are pill-shaped, the enabled send action uses Sage Signal, and a centered error-awareness note sits beneath it.

## Do's and Don'ts

### Do:

- **Do** preserve generous whitespace around the empty-state greeting and composer.
- **Do** use Lucide-style outline icons at consistent size and stroke weight.
- **Do** communicate structure with borders, tone, and spacing before adding shadow.
- **Do** keep the sidebar useful and information-rich while the main stage remains quiet.

### Don't:

- **Don't** add starter-card grids to the chat empty state.
- **Don't** use sage as a broad decorative background or apply gradients to text.
- **Don't** mix filled, multicolor, and outline icon families in the same control group.
- **Don't** introduce tracked uppercase kickers or ornamental labels into product navigation.
