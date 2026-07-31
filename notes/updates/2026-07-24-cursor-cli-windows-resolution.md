# Cursor CLI Windows resolution

Fixed desktop Cursor CLI discovery on Windows when Electron inherited a stale PATH and attempted to run the bare `cursor-agent` command. Windows Cursor Agent installations use command launchers such as `.cmd`, which cannot be executed directly with Node `execFile`.

- `AI_HARNESS_CURSOR_PATH` remains the highest-priority override.
- Windows now searches `%LOCALAPPDATA%\cursor-agent` and `PATH` for the current `agent` launcher before the legacy `cursor-agent` alias.
- `.cmd` and `.bat` launchers run through `cmd.exe` as a quoted `/c` command with `windowsVerbatimArguments` enabled, preserving launcher paths with spaces; direct executables continue to use `execFile`.
- Missing CLI failures now give an actionable login/logout message, while account status remains disconnected.

Affected files:

- `electron/main/cursor-cli.ts`
- `electron/main/cursor-cli.test.ts`

Validation: the focused Cursor CLI suite includes a Windows execution-level regression test that invokes a batch launcher from a path containing spaces. The previous validation claim that the quoted command-line adapter succeeded was incomplete: `execFile` normally escapes its embedded quotes, causing `cmd.exe` to treat the launcher as an unrecognized command. The adapter now supplies the exact quoted `/c` command with `windowsVerbatimArguments` enabled. A local Windows status smoke resolves `%LOCALAPPDATA%\cursor-agent\agent.cmd`, exits successfully, and returns `Not logged in`.

Limitation: interactive login was not launched because it starts the external authentication flow; the local Cursor account remains logged out.
