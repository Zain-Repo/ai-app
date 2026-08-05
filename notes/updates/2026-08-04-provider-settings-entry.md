# Provider management in Settings

## Outcome

Removed the provider-management button from the primary chat sidebar and moved
its entry point into the account Settings dialog. The full provider connection
workflow remains in its dedicated dialog.

## Implementation

- Renamed the account menu's Personalization entry and dialog heading to
  Settings while preserving the existing defaults and memory sections.
- Added a grouped AI providers row to General settings with the current number
  of connected providers and a clear Manage providers action.
- Close Settings before opening provider management so modal dialogs are never
  nested and focus management remains predictable.
- Suppressed the default provider trigger whenever `ProviderConnectDialog` is
  controlled by its parent, removing the redundant sidebar button without
  changing uncontrolled uses of the component.

## Validation

- All 261 Vitest tests across 59 files passed, including focused Settings,
  account-menu, provider-search, and chat-sidebar coverage.
- TypeScript type checking, scoped ESLint, and the production client/SSR build
  passed. The build retained the existing warning that
  `src/routes/chat-sidebar.test.tsx` is not a route.
- Scoped Prettier and `git diff --check` passed.
- The completed update was mirrored to the Dev3 Engineering Notes page.

## Known limitations

- Provider connection details continue to use their existing dedicated dialog;
  Settings provides the discoverable entry point and connected-state summary.
