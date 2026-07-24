# Cursor CLI desktop foundation

Added the first desktop-only Cursor integration milestone for AI Harness.

- Electron now checks the locally installed Cursor CLI and can start its native sign-in flow.
- The provider dialog displays Cursor Agent only in the desktop application.
- Convex stores only a connected Cursor metadata record; Cursor credentials remain in the local CLI profile.
- Workspace execution, task progress, and change review remain future desktop-workbench milestones.

Validation: focused Cursor status and provider-dialog tests, plus TypeScript typechecking.
