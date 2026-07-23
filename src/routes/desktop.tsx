import { auth } from "@clerk/tanstack-react-start/server"
import { Outlet, createFileRoute, redirect } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"

const enterDesktop = createServerFn().handler(async () => {
  const destination = (await auth()).isAuthenticated
    ? "/chat"
    : "/desktop/sign-in"
  throw redirect({ href: destination })
})

export const Route = createFileRoute("/desktop")({
  beforeLoad: async ({ location }) => {
    if (location.pathname.replace(/\/+$/, "") === "/desktop") {
      await enterDesktop()
    }
  },
  component: Outlet,
})
