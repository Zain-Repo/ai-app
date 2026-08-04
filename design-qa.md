# Sidebar mode controls design QA

- Source visual truth:
  - `C:\Users\Zain\AppData\Local\Temp\codex-clipboard-1569f8db-23a9-4037-930b-9b667d709206.png` (287 × 67 px)
  - `C:\Users\Zain\AppData\Local\Temp\codex-clipboard-2014a0b1-1915-42f0-b5c6-0be589b3a9f6.png` (338 × 967 px)
  - `C:\Users\Zain\AppData\Local\Temp\codex-clipboard-bf3c5e80-2c36-48d4-8231-0d7e81098457.png` (340 × 202 px)
- Implementation screenshot: unavailable because both supported browser surfaces redirect the local `/chat` route to Clerk sign-in.
- Intended viewport: 338 × 967 CSS px at device scale factor 1.
- State: signed-in chat workspace, text mode selected, output-mode menu open.
- Density normalization: source references are 1× raster captures; no valid implementation capture was available to normalize.

**Findings**

- [P1] Browser-rendered comparison is blocked
  - Location: authenticated chat sidebar.
  - Evidence: the in-app browser and Chrome both redirect `http://127.0.0.1:4173/chat` to `/sign-in`, so the implemented sidebar cannot be captured in the required signed-in state.
  - Impact: fonts, spacing, colors, icon alignment, menu elevation, and copy cannot be compared against the supplied references from rendered evidence.
  - Fix: sign in to the local preview in a supported browser, capture the closed and open menu states at 338 × 967, and repeat the full-view plus focused-region comparison.

**Required fidelity surfaces**

- Fonts and typography: blocked pending a browser-rendered sidebar capture.
- Spacing and layout rhythm: blocked pending a browser-rendered sidebar capture.
- Colors and visual tokens: blocked pending a browser-rendered sidebar capture.
- Image quality and asset fidelity: no custom raster assets are required; icon rendering remains blocked pending a browser-rendered capture.
- Copy and content: implemented as `Text — Create, learn, and explore` and `Image — Generate and refine images`; rendered comparison is blocked.

**Open Questions**

- None about the requested interaction. Authentication is the only visual-verification blocker.

**Implementation Checklist**

- Capture the signed-in sidebar in the closed text-mode state.
- Open the mode menu and capture the selected-state checkmark and descriptions.
- Exercise keyboard selection and the voice action.
- Check the browser console for runtime errors.
- Compare the source and implementation captures together and resolve all P0–P2 differences.

**Follow-up Polish**

- Defer P3 polish until the authenticated visual comparison is available.

## Comparison history

- Initial pass: blocked before visual comparison because authentication prevented an implementation capture. No visual fixes were made from browser evidence.

final result: blocked
