# TanStack SSR invalid-hook-call fix (version pins)

## Outcome

The SSR Invalid hook call / Cannot read properties of null (reading useContext) failure in renderToReadableStream, raised by HeadContent through useTags and useRouter to useContext, is addressed by pinning eight @tanstack packages from latest to explicit, mutually-compatible published versions.

The previous latest pins let the Bun resolver settle on an incoherent, mixed-release-train set (router 1.170.18, devtools 1.167.0 and 1.167.1, react-start 1.168.32, react-devtools 0.10.8). The resolver flagged all of them invalid, leaving the router family on stale, mismatched versions. That is the mismatching-versions-of-React-and-renderer class that makes a hook useContext read a null dispatcher during server rendering.

## Change
Replaced latest pins in package.json:
dependencies: @tanstack/react-devtools 0.10.12, react-router 1.170.31, react-router-devtools 1.167.1, react-router-ssr-query 1.167.1, react-start 1.168.48, router-plugin 1.168.34.
devDependencies: @tanstack/devtools-vite 0.8.5, @tanstack/eslint-config 0.4.0.
bun.lock regenerated.

## Validation
- Dev SSR rendered /, /desktop, /chat, /sign-in, /sign-up with no hook or render error; all 200 or auth redirect.
- Fresh production build succeeded.
- TypeScript typecheck passes after removing the unused `AiSuggestedActions` import from the chat route.
