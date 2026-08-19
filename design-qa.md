# Image Studio design QA

- Source visual truth: `C:\Users\Zain\AppData\Local\Temp\codex-clipboard-33075555-f2b6-45c3-b564-ffd1e13496b4.png`
- Implementation target: `http://localhost:4173/chat/?workspace=image&mode=chat-new`
- Implementation screenshot: unavailable; both the in-app browser and the existing Chrome profile redirect the local target to `/sign-in`
- Comparison viewport: 1917 × 985 CSS pixels
- Source pixels: 1749 × 899
- Implementation pixels: unavailable
- Density normalization: source was intended for the same wide desktop aspect ratio; final normalization is pending an authenticated implementation capture
- State: light-theme, new-image empty state with the settings inspector open

**Findings**

- [P0] Authenticated implementation capture is unavailable
  - Location: local Dev3 preview route.
  - Evidence: the source design opens correctly as an image, while both available browser profiles redirect `http://localhost:4173/chat/?workspace=image&mode=chat-new` to `http://localhost:4173/sign-in`.
  - Impact: the rendered implementation cannot be placed beside the source visual, so typography, spacing, colors, icon fidelity, copy, and responsive layout cannot receive the required visual comparison.
  - Fix: sign in to the local Dev3 preview in the in-app browser, capture the empty image-studio state at 1917 × 985, and rerun this comparison.

**Open Questions**

- None about the selected design. Browser authentication is the only remaining gate.

**Implementation Checklist**

- Capture the authenticated implementation at 1917 × 985.
- Compare the full frame with the selected source visual.
- Inspect focused crops for the creation rail, canvas empty state, settings inspector, and header project control.
- Exercise prompt entry, the example prompt action, settings collapse/reset, model controls, reference validation, and project selection.
- Check console errors and repeat visual comparison after any P0/P1/P2 fixes.

**Follow-up Polish**

- Pending the authenticated visual comparison.

## Comparison history

### Initial pass — 2026-08-19

- Earlier findings: authenticated capture unavailable.
- Fixes made: none; authentication cannot be bypassed or weakened for visual QA.
- Post-fix visual evidence: unavailable.

final result: blocked
