import {
  Download,
  ChevronDown,
  Image as ImageIcon,
  LoaderCircle,
  Plug,
  Sparkles,
} from "lucide-react"
import { useAction, useMutation, useQuery } from "convex/react"
import { useEffect, useMemo, useState } from "react"

import { api } from "../../../convex/_generated/api"
import type {
  ImageGenerationConfig,
  ImageModelCapability,
  ImageProvider,
} from "../../../shared/image-generation"
import { validateImageGenerationConfig } from "../../../shared/image-generation"
import { useImageGenerationDraft } from "@/hooks/use-image-generation-draft"
import { Button } from "@/components/ui/button"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
import { ImageSettings } from "./image-settings"
import { GenerationSet } from "./generation-set"
import type { GenerationOutput, GenerationSetView } from "./generation-set"
import { ReferenceStrip } from "./reference-strip"
import type { ImageReference } from "./reference-strip"

export type ImageWorkspaceModel = {
  description?: string
  label: string
  value: string
}

export type ImageWorkspaceProvider = {
  label: string
  value: ImageProvider
}

export type ImageWorkspaceRoutingOption = {
  description?: string
  label: string
  value: string
}

type ImageWorkspaceProps = {
  archived?: boolean
  capabilityRoutingProvider?: string
  conversationId?: string
  disabled?: boolean
  generationState: "generating" | "idle"
  initialReference?: { contentType: string; name: string; url: string } | null
  modelId: string
  legacyGenerations?: Array<{
    createdAt: number
    images: Array<{ name: string; url: string }>
    model: string
    prompt: string
  }>
  models: ImageWorkspaceModel[]
  onConnectProvider: () => void
  onGenerate: (request: {
    capability: ImageModelCapability
    config: ImageGenerationConfig
    files: File[]
    prompt: string
    routingProvider?: string
  }) => Promise<void>
  onModelChange: (modelId: string) => void
  onInitialReferenceConsumed?: () => void
  onProviderChange: (provider: ImageProvider) => void
  onRoutingProviderChange: (routingProvider: string) => void
  provider: ImageProvider
  providers: ImageWorkspaceProvider[]
  routingOptions: ImageWorkspaceRoutingOption[]
}

const inspirationPrompts = [
  {
    label: "Editorial portrait",
    prompt:
      "Create an editorial portrait with soft window light, natural texture, and a restrained neutral palette.",
  },
  {
    label: "Product scene",
    prompt:
      "Create a refined product scene with directional studio light, subtle shadows, and generous negative space.",
  },
  {
    label: "Landscape study",
    prompt:
      "Create a quiet landscape study at first light with atmospheric depth and muted natural color.",
  },
] as const

function capabilityErrorMessage(cause: unknown) {
  return cause instanceof Error && cause.message
    ? cause.message
    : "Model settings could not be loaded. Try another model or reconnect the provider."
}

function conciseDimensionLabel(label: string) {
  return label.replace(/\s+\d+(?:\.\d+)?:\d+(?:\.\d+)?$/, "") || label
}

export function ImageWorkspace({
  archived,
  capabilityRoutingProvider,
  conversationId,
  disabled,
  generationState,
  initialReference,
  legacyGenerations = [],
  modelId,
  models,
  onConnectProvider,
  onGenerate,
  onInitialReferenceConsumed,
  onModelChange,
  onProviderChange,
  onRoutingProviderChange,
  provider,
  providers,
  routingOptions,
}: ImageWorkspaceProps) {
  const loadCapability = useAction(api.imageModelCapabilities.get)
  const cancelGeneration = useMutation(api.imageGenerations.cancel)
  const retryGeneration = useAction(api.imageGenerationActions.retry)
  const generations = useQuery(
    api.imageGenerations.listByConversation,
    conversationId ? { conversationId } : "skip"
  )
  const [capability, setCapability] = useState<ImageModelCapability | null>(
    null
  )
  const [capabilityState, setCapabilityState] = useState<
    "failed" | "idle" | "loading" | "ready"
  >("idle")
  const [capabilityError, setCapabilityError] = useState("")
  const [prompt, setPrompt] = useState("")
  const [references, setReferences] = useState<ImageReference[]>([])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [pendingReuse, setPendingReuse] = useState<{
    config: ImageGenerationConfig
    model: string
    routingProvider: string
  } | null>(null)
  const hasActiveGeneration = (generations ?? []).some(
    (generation) =>
      generation.status === "queued" || generation.status === "running"
  )
  const [submissionError, setSubmissionError] = useState("")
  const { config, setConfig, updateConfig, validationNotice } =
    useImageGenerationDraft(capability)

  useEffect(() => {
    if (!modelId || !providers.length) {
      setCapability(null)
      setCapabilityState("idle")
      return
    }
    let canceled = false
    setCapability(null)
    setCapabilityError("")
    setCapabilityState("loading")
    void loadCapability({
      model: modelId,
      provider,
      ...(provider === "openrouter" && capabilityRoutingProvider
        ? { routingProvider: capabilityRoutingProvider }
        : {}),
    }).then(
      (next) => {
        if (canceled) return
        setCapability(next)
        setCapabilityState("ready")
      },
      (cause) => {
        if (canceled) return
        setCapability(null)
        setCapabilityError(capabilityErrorMessage(cause))
        setCapabilityState("failed")
      }
    )
    return () => {
      canceled = true
    }
  }, [
    capabilityRoutingProvider,
    loadCapability,
    modelId,
    provider,
    providers.length,
  ])

  useEffect(() => {
    if (!capability) return
    if (references.length > capability.references.max)
      setReferences((current) => current.slice(0, capability.references.max))
  }, [capability, references.length])

  useEffect(() => {
    if (
      !capability ||
      !pendingReuse ||
      capability.modelId !== pendingReuse.model ||
      (capability.endpoint ?? "auto") !== pendingReuse.routingProvider
    )
      return
    try {
      setConfig(validateImageGenerationConfig(capability, pendingReuse.config))
      setSubmissionError("")
    } catch {
      setSubmissionError(
        "The earlier settings are no longer available for this model. Current defaults were kept."
      )
    } finally {
      setPendingReuse(null)
    }
  }, [capability, pendingReuse, setConfig])

  useEffect(() => {
    if (!initialReference || !capability) return
    if (capability.references.max === 0) {
      setSubmissionError(
        "This model does not accept reference images. Choose another model to use that Library image."
      )
      onInitialReferenceConsumed?.()
      return
    }
    let canceled = false
    void fetch(initialReference.url)
      .then(async (response) => {
        if (!response.ok) throw new Error("Reference download failed")
        const blob = await response.blob()
        if (canceled) return
        setReferences((current) => {
          if (current.length >= capability.references.max) return current
          return [
            ...current,
            {
              file: new File([blob], initialReference.name, {
                type: blob.type || initialReference.contentType || "image/png",
              }),
              id: crypto.randomUUID(),
            },
          ]
        })
      })
      .catch(() => {
        if (!canceled)
          setSubmissionError(
            "The Library image could not be added as a reference."
          )
      })
      .finally(() => {
        if (!canceled) onInitialReferenceConsumed?.()
      })
    return () => {
      canceled = true
    }
  }, [capability, initialReference, onInitialReferenceConsumed])

  const selectedModel = useMemo(
    () => models.find((model) => model.value === modelId),
    [modelId, models]
  )
  const selectedProvider = useMemo(
    () => providers.find((option) => option.value === provider),
    [provider, providers]
  )
  const selectedRoutingOption = useMemo(
    () =>
      routingOptions.find(
        (option) => option.value === (capabilityRoutingProvider ?? "auto")
      ),
    [capabilityRoutingProvider, routingOptions]
  )
  const routeSummary =
    provider === "openrouter"
      ? (selectedRoutingOption?.label ?? "Automatic routing")
      : (selectedProvider?.label ?? provider)
  const settingsSummary = useMemo(() => {
    if (!capability || !config) return "Loading settings…"
    const dimension = capability.dimensions.options.find(
      (option) => option.value === config.dimension
    )
    return `${conciseDimensionLabel(dimension?.label ?? config.dimension)} · ${config.count} ${config.count === 1 ? "image" : "images"} · ${config.outputFormat.toUpperCase()}`
  }, [capability, config])
  const isSubmitting = generationState === "generating"
  const canGenerate = Boolean(
    !archived &&
    !disabled &&
    !isSubmitting &&
    capability &&
    config &&
    prompt.trim()
  )

  const generate = async () => {
    if (!capability || !config || !canGenerate) return
    setSubmissionError("")
    try {
      await onGenerate({
        capability,
        config,
        files: references.map((reference) => reference.file),
        prompt: prompt.trim(),
        ...(provider === "openrouter" && capabilityRoutingProvider
          ? { routingProvider: capabilityRoutingProvider }
          : {}),
      })
      setPrompt("")
      setReferences([])
    } catch (cause) {
      setSubmissionError(
        cause instanceof Error
          ? cause.message
          : "Image generation could not be started."
      )
    }
  }

  const changeSettings = (patch: Partial<ImageGenerationConfig>) => {
    try {
      updateConfig(patch)
      setSubmissionError("")
    } catch (cause) {
      setSubmissionError(
        cause instanceof Error ? cause.message : "That setting is unavailable."
      )
    }
  }

  const reuseGeneration = (generation: GenerationSetView) => {
    setPrompt(generation.prompt)
    const routingProvider = generation.endpoint ?? "auto"
    setPendingReuse({
      config: generation.config,
      model: generation.model,
      routingProvider,
    })
    if (generation.model !== modelId) onModelChange(generation.model)
    onRoutingProviderChange(routingProvider)
  }

  const useOutputAsReference = async (output: GenerationOutput) => {
    if (
      !output.url ||
      !capability ||
      references.length >= capability.references.max
    )
      return
    try {
      const response = await fetch(output.url)
      if (!response.ok) throw new Error()
      const blob = await response.blob()
      const file = new File(
        [blob],
        output.name ??
          `generated-reference-${output.ordinal + 1}.${blob.type.split("/")[1] ?? "png"}`,
        { type: blob.type || output.contentType || "image/png" }
      )
      setReferences((current) => [
        ...current,
        { file, id: crypto.randomUUID() },
      ])
      setSubmissionError("")
    } catch {
      setSubmissionError("That image could not be added as a reference.")
    }
  }

  const cancel = async (generationSetId: GenerationSetView["_id"]) => {
    try {
      await cancelGeneration({ generationSetId })
      setSubmissionError("")
    } catch {
      setSubmissionError("This generation could not be canceled.")
    }
  }

  const retry = async (generationSetId: GenerationSetView["_id"]) => {
    if (hasActiveGeneration) {
      setSubmissionError("Wait for the current generation to finish.")
      return
    }
    try {
      await retryGeneration({ generationSetId })
      setSubmissionError("")
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : ""
      setSubmissionError(
        message.includes("settings changed")
          ? "This model's settings changed. Reuse the prompt and review the current settings before generating again."
          : message.includes("current generation")
            ? "Wait for the current generation to finish."
            : "This generation could not be retried."
      )
    }
  }

  return (
    <div className="image-workspace flex min-h-0 flex-1 flex-col">
      <aside
        aria-label="Image creation controls"
        className="z-10 order-2 shrink-0 bg-background"
      >
        <div className="mx-auto flex w-full max-w-[1320px] flex-col border-t px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {settingsOpen && providers.length ? (
            <div className="order-2 mt-2 grid grid-cols-1 gap-3 border-x px-4 pt-3 sm:grid-cols-2">
              <label className="grid gap-1.5">
                <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Provider
                </span>
                <NativeSelect
                  className="w-full [&_[data-slot=native-select]]:rounded-md [&_[data-slot=native-select]]:border-border [&_[data-slot=native-select]]:bg-background"
                  disabled={Boolean(conversationId) || isSubmitting}
                  onChange={(event) =>
                    onProviderChange(event.target.value as ImageProvider)
                  }
                  value={provider}
                >
                  {providers.map((option) => (
                    <NativeSelectOption key={option.value} value={option.value}>
                      {option.label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </label>
              <label className="grid gap-1.5">
                <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Model
                </span>
                <NativeSelect
                  className="w-full [&_[data-slot=native-select]]:rounded-md [&_[data-slot=native-select]]:border-border [&_[data-slot=native-select]]:bg-background"
                  disabled={isSubmitting || !models.length}
                  onChange={(event) => onModelChange(event.target.value)}
                  value={modelId}
                >
                  {models.map((model) => (
                    <NativeSelectOption key={model.value} value={model.value}>
                      {model.label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </label>
            </div>
          ) : null}

          {settingsOpen &&
          provider === "openrouter" &&
          routingOptions.length ? (
            <label className="order-2 grid gap-1.5 border-x px-4 pt-2">
              <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Route
              </span>
              <NativeSelect
                className="w-full [&_[data-slot=native-select]]:rounded-md [&_[data-slot=native-select]]:border-border [&_[data-slot=native-select]]:bg-background"
                disabled={isSubmitting}
                onChange={(event) =>
                  onRoutingProviderChange(event.target.value)
                }
                value={capabilityRoutingProvider ?? "auto"}
              >
                {routingOptions.map((option) => (
                  <NativeSelectOption key={option.value} value={option.value}>
                    {option.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              {routingOptions.find(
                (option) => option.value === capabilityRoutingProvider
              )?.description ? (
                <span className="text-[11px] leading-relaxed text-muted-foreground">
                  {
                    routingOptions.find(
                      (option) => option.value === capabilityRoutingProvider
                    )?.description
                  }
                </span>
              ) : null}
            </label>
          ) : null}

          <label className="order-1 grid">
            <span className="sr-only">Image prompt</span>
            <Textarea
              aria-describedby="image-prompt-help"
              aria-label="Image prompt"
              className="min-h-[5.5rem] rounded-t-md rounded-b-none border border-b-0 border-border bg-background px-4 py-3 text-base leading-relaxed shadow-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 md:text-sm"
              disabled={archived || disabled}
              id="image-prompt"
              maxLength={8_000}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault()
                  void generate()
                }
              }}
              placeholder={
                selectedModel
                  ? `Describe the image you want ${selectedModel.label} to create…`
                  : "Choose a model to begin"
              }
              value={prompt}
            />
            <span className="sr-only" id="image-prompt-help">
              Ctrl/⌘ + Enter to generate
            </span>
          </label>

          {settingsOpen && capability && config ? (
            <div
              className="order-2 max-h-[min(36svh,20rem)] overflow-y-auto border-x px-4 py-3 sm:max-h-[min(24svh,12rem)]"
              id="image-settings-panel"
            >
              <ImageSettings
                capability={capability}
                config={config}
                disabled={archived || disabled || isSubmitting}
                onChange={changeSettings}
              />
              {capability.pricing.display ? (
                <p className="mt-5 text-xs text-muted-foreground">
                  Estimated provider price: {capability.pricing.display}
                </p>
              ) : capability.pricing.kind === "unknown" ? (
                <p className="mt-5 text-xs text-muted-foreground">
                  Price shown by your provider after generation.
                </p>
              ) : null}
            </div>
          ) : capabilityState === "loading" ? (
            <div
              className="order-0 mb-2 flex items-center gap-2 rounded-md border px-3 py-2 text-sm text-muted-foreground"
              role="status"
            >
              <LoaderCircle
                aria-hidden="true"
                className="size-4 animate-spin motion-reduce:animate-none"
              />
              Loading model settings…
            </div>
          ) : capabilityState === "failed" ? (
            <p
              className="order-0 mb-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs leading-relaxed text-destructive"
              role="alert"
            >
              {capabilityError}
            </p>
          ) : null}

          {validationNotice ? (
            <p
              className="order-0 mb-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-700 dark:text-amber-300"
              role="status"
            >
              {validationNotice}
            </p>
          ) : null}
          {submissionError ? (
            <p
              className="order-0 mb-2 rounded-md bg-destructive/8 px-3 py-2 text-xs leading-relaxed text-destructive"
              role="alert"
            >
              {submissionError}
            </p>
          ) : null}
          {archived ? (
            <p className="order-0 mb-2 text-xs text-muted-foreground">
              Restore this image thread to create more images.
            </p>
          ) : null}

          <div className="order-3 flex flex-col gap-2 rounded-b-md border bg-background px-3 py-2.5 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {capability && capability.references.max > 0 ? (
                <ReferenceStrip
                  compact
                  disabled={archived || disabled || isSubmitting}
                  limit={capability.references.max}
                  onChange={setReferences}
                  references={references}
                />
              ) : null}
              {providers.length ? (
                <div className="relative shrink-0">
                  <NativeSelect
                    aria-label="Image model"
                    className="w-52 [&_[data-slot=native-select]]:h-10 [&_[data-slot=native-select]]:rounded-md [&_[data-slot=native-select]]:border-border [&_[data-slot=native-select]]:bg-background [&_[data-slot=native-select]]:pt-0.5 [&_[data-slot=native-select]]:pb-3.5"
                    disabled={isSubmitting || !models.length}
                    onChange={(event) => onModelChange(event.target.value)}
                    value={modelId}
                  >
                    {models.map((model) => (
                      <NativeSelectOption key={model.value} value={model.value}>
                        {model.label}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute bottom-1.5 left-2.5 max-w-40 truncate text-[11px] leading-none text-muted-foreground"
                  >
                    {routeSummary}
                  </span>
                </div>
              ) : (
                <Button
                  className="h-10 rounded-md"
                  onClick={onConnectProvider}
                  type="button"
                  variant="outline"
                >
                  <Plug aria-hidden="true" />
                  Connect provider
                </Button>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 xl:flex-nowrap">
              <span className="hidden text-sm whitespace-nowrap text-foreground/80 lg:inline">
                {settingsSummary}
              </span>
              <span
                aria-hidden="true"
                className="hidden h-6 w-px bg-border lg:block"
              />
              <Button
                aria-controls="image-settings-panel"
                aria-expanded={settingsOpen}
                className="h-10 rounded-md px-3"
                disabled={!capability || !config}
                onClick={() => setSettingsOpen((open) => !open)}
                type="button"
                variant="ghost"
              >
                Settings
                <ChevronDown
                  aria-hidden="true"
                  className={`transition-transform motion-reduce:transition-none ${settingsOpen ? "rotate-180" : ""}`}
                />
              </Button>
              <span
                aria-hidden="true"
                className="hidden h-6 w-px bg-border 2xl:block"
              />
              <kbd
                aria-label="Control or Command Enter to generate"
                className="hidden h-9 items-center rounded-md border bg-background px-3 font-sans text-xs text-muted-foreground 2xl:inline-flex"
              >
                ⌘ Enter
              </kbd>
              <Button
                className="h-10 rounded-md px-5 text-sm"
                disabled={!canGenerate}
                onClick={() => void generate()}
                type="button"
              >
                {isSubmitting ? (
                  <LoaderCircle
                    aria-hidden="true"
                    className="animate-spin motion-reduce:animate-none"
                  />
                ) : (
                  <Sparkles aria-hidden="true" />
                )}
                {isSubmitting ? "Starting generation…" : "Generate"}
              </Button>
            </div>
          </div>
        </div>
      </aside>

      <main
        className="order-1 flex min-h-0 flex-1 flex-col overflow-y-auto"
        aria-label="Generated images"
      >
        <header className="mx-auto w-full max-w-[1320px] shrink-0 px-4 pt-4 pb-1 sm:px-6 lg:px-4 lg:pt-5">
          <p className="text-[11px] font-semibold tracking-[0.22em] text-muted-foreground uppercase">
            Image studio
          </p>
          <h1 className="mt-1.5 font-heading text-2xl font-light tracking-tight text-foreground sm:text-[1.75rem]">
            Create an image
          </h1>
          <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted-foreground">
            Describe a scene, choose a model, and shape the result in one quiet
            workspace.
          </p>
        </header>
        {conversationId && generations === undefined ? (
          <div
            className="grid min-h-72 flex-1 place-items-center text-sm text-muted-foreground"
            role="status"
          >
            <span className="flex items-center gap-2">
              <LoaderCircle
                aria-hidden="true"
                className="size-4 animate-spin motion-reduce:animate-none"
              />
              Loading generations…
            </span>
          </div>
        ) : generations?.length || legacyGenerations.length ? (
          <div className="mx-auto w-full max-w-[1320px] px-4 py-2 sm:px-6 lg:px-4">
            <p className="py-5 text-[11px] font-semibold tracking-[0.22em] text-muted-foreground uppercase">
              Recent generations
            </p>
            {legacyGenerations.map((generation, index) => (
              <article
                className="border-t py-8 first:border-t-0"
                key={`${generation.createdAt}-${index}`}
              >
                <header className="mb-5 max-w-2xl">
                  <p className="line-clamp-2 text-sm leading-relaxed font-medium text-foreground">
                    {generation.prompt}
                  </p>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {generation.model} · Earlier generation
                  </p>
                </header>
                <div
                  className={
                    generation.images.length === 1
                      ? "grid max-w-2xl grid-cols-1 gap-4"
                      : "grid grid-cols-1 gap-4 sm:grid-cols-2"
                  }
                >
                  {generation.images.map((image) => (
                    <div
                      className="group relative overflow-hidden rounded-lg border bg-muted/30"
                      key={image.url}
                    >
                      <img
                        alt={generation.prompt}
                        className="size-full min-h-48 object-cover"
                        loading="lazy"
                        src={image.url}
                      />
                      <Button
                        aria-label={`Download ${image.name}`}
                        className="absolute right-2 bottom-2 rounded-md bg-background/90 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
                        render={<a download={image.name} href={image.url} />}
                        size="icon-sm"
                        variant="outline"
                      >
                        <Download aria-hidden="true" />
                      </Button>
                    </div>
                  ))}
                </div>
              </article>
            ))}
            {(generations ?? []).map((generation) => (
              <GenerationSet
                generation={generation}
                key={generation._id}
                onCancel={(generationSetId) => void cancel(generationSetId)}
                onRetry={(generationSetId) => void retry(generationSetId)}
                onReuse={reuseGeneration}
                onUseAsReference={(output) => void useOutputAsReference(output)}
                retryDisabled={hasActiveGeneration}
              />
            ))}
          </div>
        ) : (
          <section className="flex min-h-0 flex-1 items-center justify-center px-6 py-5 text-center sm:min-h-[18rem] sm:py-6">
            <div className="max-w-lg">
              <span className="mx-auto grid size-14 place-items-center rounded-full border bg-background">
                <ImageIcon
                  aria-hidden="true"
                  className="size-6 text-muted-foreground"
                />
              </span>
              <h2 className="mt-4 font-heading text-2xl font-light tracking-tight">
                What would you like to create?
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Start by describing the image you want to generate.
              </p>
              <div className="mt-5 flex flex-wrap items-center justify-center text-sm text-muted-foreground">
                {inspirationPrompts.map((inspiration, index) => (
                  <span className="flex items-center" key={inspiration.label}>
                    {index > 0 ? (
                      <span aria-hidden="true" className="h-6 w-px bg-border" />
                    ) : null}
                    <button
                      className="rounded-md px-4 py-2 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50"
                      disabled={archived || disabled}
                      onClick={() => {
                        setPrompt(inspiration.prompt)
                        requestAnimationFrame(() =>
                          document.getElementById("image-prompt")?.focus()
                        )
                      }}
                      type="button"
                    >
                      {inspiration.label}
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
