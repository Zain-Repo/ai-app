import {
  AiNetworkIcon,
  ArrowRight01Icon,
  ChatGptIcon,
  CheckmarkCircle02Icon,
  ShieldKeyIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useAction, useMutation, useQuery } from "convex/react"
import { useEffect, useState } from "react"

import { api } from "../../convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  createOpenRouterAuthorization,
  OPENROUTER_PKCE_STORAGE_KEY,
} from "@/lib/openrouter-oauth"

const providers = [
  {
    id: "anthropic",
    name: "Anthropic",
    mark: "AN",
    description: "Direct Claude API access uses an API key",
    auth: "API key",
  },
  {
    id: "google",
    name: "Google Gemini",
    mark: "G",
    description: "Direct OAuth requires a configured Google Cloud client",
    auth: "OAuth setup",
  },
  {
    id: "xai",
    name: "xAI",
    mark: "x",
    description: "Direct Grok API access uses an API key",
    auth: "API key",
  },
] as const

type CreditStatus = {
  isFreeTier: boolean
  limit: number | null
  remaining: number | null
  usage: number
}

const formatUsd = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 4,
})

export function ProviderConnectDialog({
  open: controlledOpen,
  onOpenChange,
}: {
  open?: boolean
  onOpenChange?: (open: boolean) => void
} = {}) {
  const connections = useQuery(api.providerConnections.listMine)
  const connectDesktopCodex = useMutation(
    api.providerConnections.connectDesktopCodex
  )
  const getCreditStatus = useAction(api.providerOAuth.getCreditStatus)
  const connectOpenAI = useAction(api.providerOAuth.connectOpenAI)
  const [internalOpen, setInternalOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [openAiKey, setOpenAiKey] = useState("")
  const [desktopCodexAvailable, setDesktopCodexAvailable] = useState(false)
  const [desktopCodexAccount, setDesktopCodexAccount] = useState<{
    connected: boolean
    email: string | null
    planType: string | null
  } | null>(null)
  const [creditStatus, setCreditStatus] = useState<CreditStatus | null>(null)
  const [creditState, setCreditState] = useState<
    "failed" | "idle" | "loading" | "ready"
  >("idle")
  const openRouter = connections?.find(
    (connection) => connection.provider === "openrouter"
  )
  const openRouterConnectionId = openRouter?.connectionId
  const openAi = connections?.find(
    (connection) => connection.provider === "openai"
  )
  const codex = connections?.find(
    (connection) => connection.provider === "codex"
  )
  const open = controlledOpen ?? internalOpen
  const setOpen = (nextOpen: boolean) => {
    if (controlledOpen === undefined) setInternalOpen(nextOpen)
    onOpenChange?.(nextOpen)
  }

  useEffect(() => {
    const desktop = window.aiHarnessDesktop
    setDesktopCodexAvailable(Boolean(desktop))
    if (!desktop) return
    let cancelled = false
    void desktop.codex.account().then(
      (account) => {
        if (!cancelled) setDesktopCodexAccount(account)
      },
      () => {
        if (!cancelled) setDesktopCodexAccount(null)
      }
    )
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!open || !openRouterConnectionId || openRouter.status !== "connected") {
      return
    }

    let cancelled = false
    setCreditState("loading")
    void getCreditStatus({ provider: "openrouter" }).then(
      (status) => {
        if (cancelled) return
        setCreditStatus(status)
        setCreditState("ready")
      },
      () => {
        if (cancelled) return
        setCreditStatus(null)
        setCreditState("failed")
      }
    )

    return () => {
      cancelled = true
    }
  }, [getCreditStatus, open, openRouter?.status, openRouterConnectionId])

  const lowRemaining =
    creditStatus?.remaining !== null &&
    creditStatus?.remaining !== undefined &&
    creditStatus.remaining <= 1

  async function connectOpenRouter() {
    setPending(true)
    setError("")

    try {
      const authorization = await createOpenRouterAuthorization(
        window.location.origin
      )
      sessionStorage.setItem(
        OPENROUTER_PKCE_STORAGE_KEY,
        authorization.verifier
      )
      window.location.assign(authorization.authorizationUrl)
    } catch {
      setPending(false)
      setError("Could not start OpenRouter authorization. Try again.")
    }
  }

  async function saveOpenAI() {
    setPending(true)
    setError("")
    try {
      await connectOpenAI({ apiKey: openAiKey })
      setOpenAiKey("")
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not connect OpenAI"
      )
    } finally {
      setPending(false)
    }
  }

  async function connectCodex() {
    const desktop = window.aiHarnessDesktop
    if (!desktop) return
    setPending(true)
    setError("")
    try {
      const account = await desktop.codex.login()
      await connectDesktopCodex({
        ...(account.email ? { email: account.email } : {}),
        ...(account.planType ? { planType: account.planType } : {}),
      })
      setDesktopCodexAccount(account)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not connect ChatGPT subscription"
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) setError("")
      }}
    >
      <Button
        aria-haspopup="dialog"
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
      >
        <HugeiconsIcon
          aria-hidden="true"
          icon={AiNetworkIcon}
          strokeWidth={1.8}
        />
        {openRouter?.status === "connected" ? "Providers" : "Connect provider"}
      </Button>

      <DialogContent className="max-h-[min(42rem,calc(100vh-2rem))] max-w-xl gap-0 overflow-y-auto p-0 sm:max-w-xl">
        <DialogHeader className="border-b border-border/70 bg-muted/30 px-6 py-5 pr-14">
          <div className="mb-2 grid size-10 place-items-center rounded-2xl bg-foreground text-background shadow-sm">
            <HugeiconsIcon
              aria-hidden="true"
              icon={AiNetworkIcon}
              strokeWidth={1.8}
            />
          </div>
          <DialogTitle className="text-lg">Connect an AI provider</DialogTitle>
          <DialogDescription className="max-w-md leading-relaxed">
            Connect once, then choose from the models available to your account
            in the chat composer.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 px-6 py-5">
          <section aria-labelledby="recommended-provider-heading">
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <h3
                id="recommended-provider-heading"
                className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
              >
                Recommended
              </h3>
              <span className="rounded-full border border-border/80 bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                OAuth + PKCE
              </span>
            </div>

            {desktopCodexAvailable ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => void connectCodex()}
                className="group mb-2 flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-3.5 text-left shadow-sm transition-colors hover:border-foreground/20 hover:bg-muted/35 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-wait disabled:opacity-60"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-foreground text-background">
                  <HugeiconsIcon
                    aria-hidden="true"
                    className="size-5"
                    icon={ChatGptIcon}
                    strokeWidth={1.8}
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 font-medium">
                    ChatGPT subscription
                    {desktopCodexAccount?.connected ||
                    codex?.status === "connected" ? (
                      <HugeiconsIcon
                        aria-label="Connected"
                        className="size-4 text-emerald-600"
                        icon={CheckmarkCircle02Icon}
                        strokeWidth={2}
                      />
                    ) : null}
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                    Use Codex models through your ChatGPT plan. Sign-in stays on
                    this device.
                  </span>
                  {desktopCodexAccount?.email ? (
                    <span className="mt-1 block truncate text-[11px] text-muted-foreground">
                      {desktopCodexAccount.email}
                      {desktopCodexAccount.planType
                        ? ` (${desktopCodexAccount.planType})`
                        : ""}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-xs font-medium text-foreground">
                  {pending
                    ? "Opening..."
                    : desktopCodexAccount?.connected ||
                        codex?.status === "connected"
                      ? "Reconnect"
                      : "Connect"}
                </span>
              </button>
            ) : null}

            <button
              type="button"
              disabled={pending}
              onClick={() => void connectOpenRouter()}
              className="group flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-3.5 text-left shadow-sm transition-colors hover:border-foreground/20 hover:bg-muted/35 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-wait disabled:opacity-60"
            >
              <span
                aria-hidden="true"
                className="grid size-11 shrink-0 place-items-center rounded-xl bg-foreground text-xs font-semibold text-background"
              >
                OR
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 font-medium">
                  OpenRouter
                  {openRouter?.status === "connected" ? (
                    <HugeiconsIcon
                      aria-label="Connected"
                      className="size-4 text-emerald-600"
                      icon={CheckmarkCircle02Icon}
                      strokeWidth={2}
                    />
                  ) : null}
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                  Sign in securely to use OpenAI, Anthropic, Google, and other
                  model families.
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-foreground">
                {pending
                  ? "Opening..."
                  : openRouter?.status === "connected"
                    ? "Reconnect"
                    : "Connect"}
                <HugeiconsIcon
                  aria-hidden="true"
                  className="size-4 transition-transform group-hover:translate-x-0.5"
                  icon={ArrowRight01Icon}
                  strokeWidth={2}
                />
              </span>
            </button>

            {openRouter?.status === "connected" ? (
              <div className="mt-2 rounded-xl border border-border/80 bg-muted/25 px-3.5 py-3 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">API key credit</span>
                  {creditState === "loading" ? (
                    <span className="text-muted-foreground">Refreshing...</span>
                  ) : creditState === "ready" && creditStatus ? (
                    <span className="font-medium tabular-nums">
                      {creditStatus.remaining === null
                        ? "No key limit"
                        : `${formatUsd.format(creditStatus.remaining)} left`}
                    </span>
                  ) : null}
                </div>

                {creditState === "ready" && creditStatus ? (
                  <p className="mt-1 text-muted-foreground">
                    {formatUsd.format(creditStatus.usage)} used by this key
                    {creditStatus.limit === null
                      ? ". OpenRouter does not expose the account balance to this key."
                      : ` of a ${formatUsd.format(creditStatus.limit)} key limit.`}
                  </p>
                ) : creditState === "failed" ? (
                  <p className="mt-1 text-muted-foreground">
                    Credit status is temporarily unavailable.
                  </p>
                ) : null}

                {creditStatus?.isFreeTier || lowRemaining ? (
                  <div
                    className="mt-2 flex items-center justify-between gap-3 rounded-lg bg-amber-500/10 px-2.5 py-2 text-amber-800 dark:text-amber-300"
                    role="alert"
                  >
                    <span>
                      {creditStatus.isFreeTier
                        ? "Add credits before using paid models."
                        : "This key is close to its spending limit."}
                    </span>
                    <a
                      className="shrink-0 font-medium underline underline-offset-2"
                      href="https://openrouter.ai/settings/credits"
                      rel="noreferrer"
                      target="_blank"
                    >
                      Top up
                    </a>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>

          <section
            aria-labelledby="openai-provider-heading"
            className="rounded-2xl border border-border/80 bg-muted/25 p-4"
          >
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-border bg-background shadow-sm">
                <HugeiconsIcon
                  aria-hidden="true"
                  className="size-5"
                  icon={ChatGptIcon}
                  strokeWidth={1.8}
                />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 id="openai-provider-heading" className="font-medium">
                    OpenAI
                  </h3>
                  <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                    Direct API key
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Use OpenAI models directly with your own API key. Your key is
                  encrypted before it is stored.
                </p>
                <div className="mt-3 flex gap-2">
                  <Input
                    aria-label="OpenAI API key"
                    autoComplete="off"
                    onChange={(event) => setOpenAiKey(event.target.value)}
                    placeholder={
                      openAi?.status === "connected" ? "Key saved" : "sk-..."
                    }
                    type="password"
                    value={openAiKey}
                  />
                  <Button
                    disabled={pending || !openAiKey.trim()}
                    size="sm"
                    onClick={() => void saveOpenAI()}
                  >
                    {openAi?.status === "connected" ? "Update" : "Connect"}
                  </Button>
                </div>
              </div>
            </div>
          </section>

          <section aria-labelledby="direct-provider-heading">
            <div className="mb-2.5 flex items-center gap-2">
              <HugeiconsIcon
                aria-hidden="true"
                className="size-4 text-muted-foreground"
                icon={ShieldKeyIcon}
                strokeWidth={1.8}
              />
              <h3
                id="direct-provider-heading"
                className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
              >
                Direct connections
              </h3>
            </div>
            <div className="divide-y divide-border/70 overflow-hidden rounded-2xl border border-border/80">
              {providers.map((provider) => (
                <div
                  key={provider.id}
                  className="flex items-center gap-3 bg-card px-3.5 py-3"
                >
                  <span
                    aria-hidden="true"
                    className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-[11px] font-semibold tracking-tight"
                  >
                    {provider.mark}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">
                      {provider.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {provider.description}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {provider.auth}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>

        {error ? (
          <p
            role="alert"
            className="mx-6 mb-5 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
