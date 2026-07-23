import { createFileRoute } from "@tanstack/react-router"

import { AuthPage } from "@/components/auth-page"

export const Route = createFileRoute("/sign-up/$")({
  component: Page,
})

function Page() {
  return <AuthPage mode="sign-up" />
}
