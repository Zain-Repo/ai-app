import {
  AiNetworkIcon,
  ArrowRight01Icon,
  Cancel01Icon,
  ChatGptIcon,
  CheckmarkCircle02Icon,
  Search01Icon,
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

export function matchesProviderSearch(
  query: string,
  terms: readonly (string | null | undefined)[]
) {
  const normalizedQuery = query.trim().toLowerCase()
  return (
    normalizedQuery.length === 0 ||
    terms.some((term) => term?.toLowerCase().includes(normalizedQuery))
  )
}

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
  const connectDesktopCursor = useMutation(
    api.providerConnections.connectDesktopCursor
  )
  const getCreditStatus = useAction(api.providerOAuth.getCreditStatus)
  const connectOpenAI = useAction(api.providerOAuth.connectOpenAI)
  const connectFal = useAction(api.providerOAuth.connectFal)
  const [internalOpen, setInternalOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [openAiKey, setOpenAiKey] = useState("")
  const [falKey, setFalKey] = useState("")
  const [desktopCodexAvailable, setDesktopCodexAvailable] = useState(false)
  const [desktopCodexAccount, setDesktopCodexAccount] = useState<{
    connected: boolean
    email: string | null
    planType: string | null
  } | null>(null)
  const [desktopCursorAccount, setDesktopCursorAccount] = useState<{
    connected: boolean
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
  const fal = connections?.find((connection) => connection.provider === "fal")
  const codex = connections?.find(
    (connection) => connection.provider === "codex"
  )
  const cursor = connections?.find(
    (connection) => connection.provider === "cursor"
  )
  const open = controlledOpen ?? internalOpen
  const showCodex =
    desktopCodexAvailable &&
    matchesProviderSearch(searchQuery, [
      "ChatGPT subscription",
      "Codex",
      "OAuth",
      desktopCodexAccount?.email,
      desktopCodexAccount?.planType,
    ])
  const showOpenRouter = matchesProviderSearch(searchQuery, [
    "OpenRouter",
    "OAuth",
    "PKCE",
    "OpenAI",
    "Anthropic",
    "Google",
  ])
  const showCursor =
    desktopCodexAvailable &&
    matchesProviderSearch(searchQuery, ["Cursor", "Cursor CLI", "local"])
  const showOpenAi = matchesProviderSearch(searchQuery, [
    "OpenAI",
    "API key",
    "direct",
  ])
  const showFal = matchesProviderSearch(searchQuery, [
    "fal",
    "image generation",
    "API key",
    "direct",
  ])
  const filteredProviders = providers.filter((provider) =>
    matchesProviderSearch(searchQuery, [
      provider.name,
      provider.description,
      provider.auth,
    ])
  )
  const hasSearchResults =
    showCodex ||
    showCursor ||
    showOpenRouter ||
    showOpenAi ||
    showFal ||
    filteredProviders.length > 0
  const setOpen = (nextOpen: boolean) => {
    if (controlledOpen === undefined) setInternalOpen(nextOpen)
    onOpenChange?.(nextOpen)
  }

  useEffect(() => {
    const desktop = window.dev3Desktop
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
    void desktop.cursor.account().then(
      (account) => {
        if (!cancelled) setDesktopCursorAccount(account)
      },
      () => {
        if (!cancelled) setDesktopCursorAccount(null)
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

  async function saveFal() {
    setPending(true)
    setError("")
    try {
      await connectFal({ apiKey: falKey })
      setFalKey("")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not connect Fal")
    } finally {
      setPending(false)
    }
  }

  async function connectCodex() {
    const desktop = window.dev3Desktop
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

  async function connectCursor() {
    const desktop = window.dev3Desktop
    if (!desktop) return
    setPending(true)
    setError("")
    try {
      const account = await desktop.cursor.login()
      await connectDesktopCursor({})
      setDesktopCursorAccount(account)
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not connect Cursor"
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
        if (!nextOpen) {
          setError("")
          setSearchQuery("")
        }
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
        {connections?.some((connection) => connection.status === "connected")
          ? "Providers"
          : "Connect provider"}
      </Button>

      <DialogContent className="max-h-[min(44rem,calc(100vh-2rem))] max-w-2xl grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <div className="border-b border-border/70 bg-[linear-gradient(135deg,var(--muted),transparent_55%)]">
          <DialogHeader className="px-6 pt-6 pr-16 pb-4">
            <div className="mb-3 grid size-9 place-items-center rounded-xl bg-foreground text-background shadow-sm">
              <HugeiconsIcon
                aria-hidden="true"
                className="size-[18px]"
                icon={AiNetworkIcon}
                strokeWidth={1.8}
              />
            </div>
            <DialogTitle className="text-xl tracking-tight">
              Connect an AI provider
            </DialogTitle>
            <DialogDescription className="max-w-lg leading-relaxed">
              Connect an account once, then choose its available models in the
              chat composer.
            </DialogDescription>
          </DialogHeader>

          <div className="px-6 pb-5">
            <label className="sr-only" htmlFor="provider-search">
              Search providers
            </label>
            <div className="relative">
              <HugeiconsIcon
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3.5 z-10 size-4 -translate-y-1/2 text-muted-foreground"
                icon={Search01Icon}
                strokeWidth={2}
              />
              <Input
                autoComplete="off"
                className="h-11 appearance-none rounded-xl border-border/70 bg-background/85 pr-10 pl-10 shadow-sm backdrop-blur placeholder:text-muted-foreground/80 focus-visible:bg-background [&::-webkit-search-cancel-button]:hidden"
                id="provider-search"
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search providers or connection types"
                type="search"
                value={searchQuery}
              />
              {searchQuery ? (
                <button
                  aria-label="Clear provider search"
                  className="absolute top-1/2 right-2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground transition-colors before:absolute before:-inset-1.5 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  onClick={() => setSearchQuery("")}
                  type="button"
                >
                  <HugeiconsIcon
                    aria-hidden="true"
                    className="size-4"
                    icon={Cancel01Icon}
                    strokeWidth={2}
                  />
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="overflow-y-auto px-6 py-2">
          {!hasSearchResults ? (
            <div className="grid min-h-56 place-items-center py-10 text-center">
              <div>
                <div className="mx-auto mb-3 grid size-10 place-items-center rounded-xl bg-muted text-muted-foreground">
                  <HugeiconsIcon
                    aria-hidden="true"
                    className="size-5"
                    icon={Search01Icon}
                    strokeWidth={1.8}
                  />
                </div>
                <p className="font-heading text-sm font-medium">
                  No providers found
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Try a provider name, OAuth, or API key.
                </p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-border/70">
              {showCodex || showCursor || showOpenRouter ? (
                <section
                  aria-labelledby="recommended-provider-heading"
                  className="py-5"
                >
                  <div className="mb-1 flex items-center justify-between gap-3 px-1">
                    <h3
                      id="recommended-provider-heading"
                      className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase"
                    >
                      Recommended
                    </h3>
                    <span className="text-[11px] font-medium text-muted-foreground">
                      OAuth + PKCE
                    </span>
                  </div>

                  <div className="divide-y divide-border/60">
                    {showCodex ? (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => void connectCodex()}
                        className="group flex min-h-20 w-full items-center gap-3 px-1 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-wait disabled:opacity-60"
                      >
                        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-foreground text-background shadow-sm">
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
                            Use Codex models through your ChatGPT plan. Sign-in
                            stays on this device.
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
                        <span className="shrink-0 text-xs font-semibold text-foreground">
                          {pending
                            ? "Opening..."
                            : desktopCodexAccount?.connected ||
                                codex?.status === "connected"
                              ? "Reconnect"
                              : "Connect"}
                        </span>
                      </button>
                    ) : null}

                    {showCursor ? (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => void connectCursor()}
                        className="group flex min-h-20 w-full items-center gap-3 px-1 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-wait disabled:opacity-60"
                      >
                        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted font-heading text-xs font-semibold shadow-sm">
                          CU
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2 font-medium">
                            Cursor Agent
                            {desktopCursorAccount?.connected ||
                            cursor?.status === "connected" ? (
                              <HugeiconsIcon
                                aria-label="Connected"
                                className="size-4 text-emerald-600"
                                icon={CheckmarkCircle02Icon}
                                strokeWidth={2}
                              />
                            ) : null}
                          </span>
                          <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                            Connect the Cursor CLI already signed in on this
                            device.
                          </span>
                        </span>
                        <span className="shrink-0 text-xs font-semibold text-foreground">
                          {pending
                            ? "Opening..."
                            : desktopCursorAccount?.connected ||
                                cursor?.status === "connected"
                              ? "Reconnect"
                              : "Connect"}
                        </span>
                      </button>
                    ) : null}

                    {showOpenRouter ? (
                      <>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => void connectOpenRouter()}
                          className="group flex min-h-20 w-full items-center gap-3 px-1 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-wait disabled:opacity-60"
                        >
                          <span
                            aria-hidden="true"
                            className="grid size-10 shrink-0 place-items-center rounded-xl bg-foreground font-heading text-[11px] font-semibold text-background shadow-sm"
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
                              Sign in securely for OpenAI, Anthropic, Google,
                              and other model families.
                            </span>
                          </span>
                          <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-foreground">
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
                          <div className="ml-[3.25rem] border-t border-border/50 py-3 text-xs">
                            <div className="flex items-center justify-between gap-3">
                              <span className="font-medium">
                                API key credit
                              </span>
                              {creditState === "loading" ? (
                                <span className="text-muted-foreground">
                                  Refreshing...
                                </span>
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
                                {formatUsd.format(creditStatus.usage)} used by
                                this key
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
                                className="mt-2 flex items-center justify-between gap-3 border-l-2 border-amber-500 bg-amber-500/10 px-3 py-2 text-amber-800 dark:text-amber-300"
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
                      </>
                    ) : null}
                  </div>
                </section>
              ) : null}

              {showOpenAi ? (
                <section
                  aria-labelledby="openai-provider-heading"
                  className="py-5"
                >
                  <div className="flex items-start gap-3 px-1">
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
                        <h3
                          id="openai-provider-heading"
                          className="font-medium"
                        >
                          OpenAI
                        </h3>
                        <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                          Direct API key
                        </span>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        Use OpenAI models directly with your own API key. Your
                        key is encrypted before it is stored.
                      </p>
                      <div className="mt-3 flex gap-2">
                        <Input
                          aria-label="OpenAI API key"
                          autoComplete="off"
                          className="h-9 rounded-xl"
                          onChange={(event) => setOpenAiKey(event.target.value)}
                          placeholder={
                            openAi?.status === "connected"
                              ? "Key saved"
                              : "sk-..."
                          }
                          type="password"
                          value={openAiKey}
                        />
                        <Button
                          disabled={pending || !openAiKey.trim()}
                          size="sm"
                          onClick={() => void saveOpenAI()}
                        >
                          {openAi?.status === "connected"
                            ? "Update"
                            : "Connect"}
                        </Button>
                      </div>
                    </div>
                  </div>
                </section>
              ) : null}

              {showFal ? (
                <section
                  aria-labelledby="fal-provider-heading"
                  className="py-5"
                >
                  <div className="flex items-start gap-3 px-1">
                    <span
                      aria-hidden="true"
                      className="grid size-10 shrink-0 place-items-center rounded-xl border border-border bg-background font-heading text-xs font-semibold shadow-sm"
                    >
                      fal
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 id="fal-provider-heading" className="font-medium">
                          Fal
                        </h3>
                        <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                          Image API key
                        </span>
                        {fal?.status === "connected" ? (
                          <HugeiconsIcon
                            aria-label="Connected"
                            className="size-4 text-emerald-600"
                            icon={CheckmarkCircle02Icon}
                            strokeWidth={2}
                          />
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        Use curated Fal image models through the reliable queue
                        API. Your key is verified, encrypted, and kept on the
                        server.
                      </p>
                      <div className="mt-3 flex gap-2">
                        <Input
                          aria-label="Fal API key"
                          autoComplete="off"
                          className="h-9 rounded-xl"
                          onChange={(event) => setFalKey(event.target.value)}
                          placeholder={
                            fal?.status === "connected"
                              ? "Key saved"
                              : "Paste Fal API key"
                          }
                          type="password"
                          value={falKey}
                        />
                        <Button
                          disabled={pending || !falKey.trim()}
                          size="sm"
                          onClick={() => void saveFal()}
                        >
                          {fal?.status === "connected" ? "Update" : "Connect"}
                        </Button>
                      </div>
                    </div>
                  </div>
                </section>
              ) : null}

              {filteredProviders.length > 0 ? (
                <section
                  aria-labelledby="direct-provider-heading"
                  className="py-5"
                >
                  <div className="mb-1 flex items-center gap-2 px-1">
                    <HugeiconsIcon
                      aria-hidden="true"
                      className="size-4 text-muted-foreground"
                      icon={ShieldKeyIcon}
                      strokeWidth={1.8}
                    />
                    <h3
                      id="direct-provider-heading"
                      className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase"
                    >
                      More direct connections
                    </h3>
                  </div>
                  <div className="divide-y divide-border/60">
                    {filteredProviders.map((provider) => (
                      <div
                        key={provider.id}
                        className="flex min-h-16 items-center gap-3 px-1 py-3"
                      >
                        <span
                          aria-hidden="true"
                          className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted font-heading text-[11px] font-semibold tracking-tight"
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
              ) : null}
            </div>
          )}

          {error ? (
            <p
              role="alert"
              className="mb-5 border-l-2 border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
