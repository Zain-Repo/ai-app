# Product

<!-- uizze:product-schema 1 -->

## Platform

web

## Users

Developers and technical knowledge workers using Dev3 in a browser or its Electron desktop wrapper to work with AI conversations, project context, files, and saved workspace history.

## Product Purpose

Dev3 provides an AI workspace for starting and revisiting conversations, working with project-scoped context, managing reusable sources and memories, and using connected model providers. Success means users can orient themselves quickly, preserve context across sessions, and complete AI-assisted work without losing control of their data or provider settings.

## Positioning

Dev3 combines conversational AI with project-scoped sources, persistent workspace history, provider choice, and desktop-oriented workflows in one application shell.

## Operating Context

Users move between general chat, project workspaces, a reusable library, generated images, archived conversations, preferences, and provider configuration. The same React interface runs on the web and inside an Electron wrapper.

## Capabilities and Constraints

- Preserve existing authentication, conversation, project, source, memory, image-generation, provider, and desktop-update behavior.
- Keep Dev3 as the user-facing product identity while retaining the compatibility identifiers documented in `notes/decisions/2026-08-04-dev3-brand-and-application-identity.md`.
- Maintain keyboard navigation, responsive mobile behavior, dark-theme semantics, reduced-motion support, and the existing shadcn/Base UI component architecture.
- Do not fabricate product capabilities, customer claims, or performance evidence.

## Brand Commitments

Dev3 is the visible product name. The user-supplied chat workspace reference is binding for this redesign: a bright neutral canvas, soft borders, compact rounded controls, restrained green accents, clean sans-serif typography, and simple outline icons. The reference's center starter cards are explicitly excluded.

## Evidence on Hand

- Product behavior and routes in `src/routes/` and `src/components/`.
- Existing implementation and decision records in `notes/`.
- User-supplied visual reference at `C:/Users/Zain/AppData/Local/Temp/codex-clipboard-71a09f42-2494-4593-a422-93c349cf60a5.png`.
- No customer logos, testimonials, benchmarks, or other commercial proof are approved for use.

## Product Principles

- Keep the primary work surface calm, direct, and fast to scan.
- Preserve user context and make workspace state legible.
- Prefer familiar, accessible controls over decorative interface chrome.
- Keep provider and data-management choices explicit and reversible.

## Accessibility & Inclusion

Preserve semantic controls, accessible names, visible focus states, keyboard navigation, readable contrast, reduced-motion behavior, and mobile input sizing that avoids unintended browser zoom.
