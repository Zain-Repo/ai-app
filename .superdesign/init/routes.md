# Routes

Framework: TanStack React Start with file-based TanStack Router routes.

| URL | Component | Layout / purpose |
| --- | --- | --- |
| `/` | `src/routes/index.tsx` | Public landing and product entry. |
| `/chat` | `src/routes/chat.{-}.tsx` | Main application shell; empty chat or selected conversation. |
| `/chat/` | `src/routes/chat.{-}.tsx` | Conversation route; also hosts the Image Studio workspace. |
| `/sign-in/*` | `src/routes/sign-in.$.tsx` | Web authentication. |
| `/sign-up/*` | `src/routes/sign-up.$.tsx` | Web registration. |
| `/desktop` | `src/routes/desktop.tsx` | Desktop application entry. |
| `/desktop/sign-in/*` | `src/routes/desktop.sign-in.$.tsx` | Desktop authentication. |
| `/desktop/sign-up/*` | `src/routes/desktop.sign-up.$.tsx` | Desktop registration. |
| `/provider-callback/openrouter` | `src/routes/provider-callback.openrouter.tsx` | Provider OAuth callback. |

The image studio is rendered inside `ChatWorkspace` when `workspace === \"image\"` and the image-studio rollout is enabled. Its direct view component is `src/components/image-workspace/image-workspace.tsx`.

## Router configuration

```tsx
import { createRouter as createTanStackRouter } from "@tanstack/react-router"
import { routeTree } from "./routeTree.gen"

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,

    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
  })

  return router
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}

```
