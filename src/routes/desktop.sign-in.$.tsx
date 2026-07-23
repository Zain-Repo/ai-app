import { createFileRoute } from "@tanstack/react-router"

import { AuthPage } from "@/components/auth-page"

export const Route = createFileRoute("/desktop/sign-in/$")({
  component: () => <AuthPage desktop mode="sign-in" />,
})
