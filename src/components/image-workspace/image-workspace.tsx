import {
  Download,
  Image as ImageIcon,
  Info,
  LoaderCircle,
  Plug,
  RotateCcw,
  Settings2,
  Sparkles,
  WandSparkles,
} from "lucide-react"
import { useAction, useMutation, useQuery } from "convex/react"
import { useEffect, useMemo, useState } from "react"

import { api } from "../../../convex/_generated/api"
import type {
  ImageGenerationConfig,
  ImageModelCapability,
  ImageProvider,
} from "../../../shared/image-generation"
import {
  getDefaultImageGenerationConfig,
  validateImageGenerationConfig,
} from "../../../shared/image-generation"
import { Button } from "@/components/ui/button"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
import { useImageGenerationDraft } from "@/hooks/use-image-generation-draft"
import { GenerationSet } from "./generation-set"
import type { GenerationOutput, GenerationSetView } from "./generation-set"
import { ImageSettings } from "./image-settings"
import { RecentGenerationsCarousel } from "./recent-generations-carousel"
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
  legacyGenerations?: Array<{
    createdAt: number
    images: Array<{ name: string; url: string }>
    model: string
    prompt: string
  }>
  modelId: string
  models: ImageWorkspaceModel[]
  onConnectProvider: () => void
  onGenerate: (request: {
    capability: ImageModelCapability
    config: ImageGenerationConfig
    files: File[]
    prompt: string
    routingProvider?: string
  }) => Promise<void>
  onInitialReferenceConsumed?: () => void
  onModelChange: (modelId: string) => void
  onProviderChange: (provider: ImageProvider) => void
  onRoutingProviderChange: (routingProvider: string) => void
  provider: ImageProvider
  providers: ImageWorkspaceProvider[]
  routingOptions: ImageWorkspaceRoutingOption[]
}

const inspirationPrompts = [
  {
    description: "Warm interior, directional light",
    label: "Modern living room",
    prompt:
      "Create a refined product scene in a modern living room with warm natural materials, directional window light, subtle shadows, and generous negative space.",
  },
  {
    description: "Rain, neon, cinematic depth",
    label: "Cyberpunk city",
    prompt:
      "A cinematic cyberpunk city at night after rainfall, reflected neon signs, layered street depth, and a restrained atmospheric color palette.",
  },
  {
    description: "Natural light, editorial detail",
    label: "Portrait photography",
    prompt:
      "An editorial portrait in soft natural light, authentic skin detail, an 85mm lens look, and a quiet warm background.",
  },
] as const

function capabilityErrorMessage(cause: unknown) {
  return cause instanceof Error && cause.message
    ? cause.message
    : "Model settings could not be loaded. Try another model or reconnect the provider."
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
  const isSubmitting = generationState === "generating"
  const canGenerate = Boolean(
    !archived &&
    !disabled &&
    !isSubmitting &&
    capability &&
    config &&
    prompt.trim()
  )
  const hasGenerations = Boolean(
    legacyGenerations.length || generations?.length
  )
  const newestGenerations = [...(generations ?? [])].reverse()

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

  const resetSettings = () => {
    if (!capability) return
    setConfig(getDefaultImageGenerationConfig(capability))
    setSubmissionError("")
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
    <div className="image-workspace image-studio-grid min-h-0 flex-1 overflow-hidden">
      <main
        aria-label="Image creation controls"
        className="image-studio-create-panel min-h-0 min-w-0 overflow-y-auto"
        data-testid="image-studio-create"
      >
        <div className="mx-auto w-full max-w-5xl px-5 py-6 sm:px-7 lg:px-8 lg:py-8">
          <header className="max-w-2xl">
            <p className="image-studio-kicker">Dev3 Image</p>
            <h1 className="mt-2 font-heading text-2xl font-semibold tracking-[-0.035em] text-balance sm:text-3xl">
              Create something amazing
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
              Turn your ideas into polished visuals with model-aware controls.
            </p>
          </header>

          <section className="image-studio-composer mt-6" aria-label="Prompt">
            <label className="grid">
              <span className="sr-only">Image prompt</span>
              <Textarea
                aria-describedby="image-prompt-help"
                aria-label="Image prompt"
                className="min-h-40 resize-none border-0 bg-transparent px-4 pt-4 pb-3 text-base leading-relaxed shadow-none focus-visible:ring-0 sm:min-h-44"
                disabled={archived || disabled}
                id="image-prompt"
                maxLength={8_000}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    (event.metaKey || event.ctrlKey) &&
                    event.key === "Enter"
                  ) {
                    event.preventDefault()
                    void generate()
                  }
                }}
                placeholder="Describe the image you want to create…"
                value={prompt}
              />
              <span className="sr-only" id="image-prompt-help">
                Control or Command plus Enter to generate
              </span>
            </label>

            <div className="flex flex-col gap-3 border-t px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Button
                  aria-label="Use an example prompt"
                  className="text-muted-foreground"
                  disabled={archived || disabled}
                  onClick={() => {
                    setPrompt(inspirationPrompts[0].prompt)
                    requestAnimationFrame(() =>
                      document.getElementById("image-prompt")?.focus()
                    )
                  }}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <WandSparkles aria-hidden="true" />
                  Inspire me
                </Button>
                {capability && capability.references.max > 0 ? (
                  <ReferenceStrip
                    compact
                    disabled={archived || disabled || isSubmitting}
                    limit={capability.references.max}
                    onChange={setReferences}
                    references={references}
                  />
                ) : null}
                <Button
                  aria-controls="image-settings-panel"
                  aria-expanded={settingsOpen}
                  className="text-muted-foreground"
                  disabled={!capability || !config}
                  onClick={() => setSettingsOpen((open) => !open)}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <Settings2 aria-hidden="true" />
                  Settings
                </Button>
              </div>

              <div className="flex shrink-0 items-center justify-end gap-3">
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {prompt.length}/8000
                </span>
                <Button
                  className="min-w-32"
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
                  {isSubmitting ? "Starting…" : "Generate"}
                </Button>
              </div>
            </div>
          </section>

          <section
            aria-label="Generation controls"
            className="image-studio-control-strip mt-4"
          >
            {providers.length ? (
              <label className="grid min-w-0 gap-1.5">
                <span className="image-studio-control-label">Model</span>
                <span className="relative">
                  <NativeSelect
                    aria-label="Image model"
                    className="w-full [&_[data-slot=native-select]]:h-12 [&_[data-slot=native-select]]:pt-0.5 [&_[data-slot=native-select]]:pb-4"
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
                    className="pointer-events-none absolute bottom-1.5 left-2.5 max-w-[calc(100%-2.5rem)] truncate text-[10px] leading-none text-muted-foreground"
                  >
                    {routeSummary}
                  </span>
                </span>
              </label>
            ) : (
              <Button
                className="self-end"
                onClick={onConnectProvider}
                type="button"
                variant="outline"
              >
                <Plug aria-hidden="true" />
                Connect provider
              </Button>
            )}

            {capabilityState === "loading" ? (
              <div
                className="flex min-h-12 items-center gap-2 text-xs text-muted-foreground"
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
                className="text-xs leading-relaxed text-destructive"
                role="alert"
              >
                {capabilityError}
              </p>
            ) : capability && config ? (
              <ImageSettings
                capability={capability}
                config={config}
                disabled={archived || disabled || isSubmitting}
                onChange={changeSettings}
                section="primary"
              />
            ) : null}
          </section>

          {settingsOpen ? (
            <section
              aria-labelledby="advanced-image-settings-title"
              className="image-studio-settings-panel mt-4"
              id="image-settings-panel"
            >
              <header className="flex items-center justify-between gap-4 border-b px-4 py-3">
                <div>
                  <h2
                    className="text-sm font-semibold"
                    id="advanced-image-settings-title"
                  >
                    Advanced settings
                  </h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Provider routing and model-specific generation controls.
                  </p>
                </div>
                <Button
                  className="shrink-0 text-muted-foreground"
                  disabled={!capability || !config || isSubmitting}
                  onClick={resetSettings}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  Reset
                  <RotateCcw aria-hidden="true" />
                </Button>
              </header>

              <div className="image-studio-settings-grid p-4">
                {providers.length ? (
                  <div className="grid content-start gap-3">
                    <label className="grid gap-1.5">
                      <span className="image-studio-control-label">
                        Provider
                      </span>
                      <NativeSelect
                        disabled={Boolean(conversationId) || isSubmitting}
                        onChange={(event) =>
                          onProviderChange(event.target.value as ImageProvider)
                        }
                        value={provider}
                      >
                        {providers.map((option) => (
                          <NativeSelectOption
                            key={option.value}
                            value={option.value}
                          >
                            {option.label}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </label>

                    {provider === "openrouter" && routingOptions.length ? (
                      <label className="grid gap-1.5">
                        <span className="image-studio-control-label">
                          Route
                        </span>
                        <NativeSelect
                          disabled={isSubmitting}
                          onChange={(event) =>
                            onRoutingProviderChange(event.target.value)
                          }
                          value={capabilityRoutingProvider ?? "auto"}
                        >
                          {routingOptions.map((option) => (
                            <NativeSelectOption
                              key={option.value}
                              value={option.value}
                            >
                              {option.label}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                        {selectedRoutingOption?.description ? (
                          <span className="text-[11px] leading-relaxed text-muted-foreground">
                            {selectedRoutingOption.description}
                          </span>
                        ) : null}
                      </label>
                    ) : null}
                  </div>
                ) : null}

                <div className="min-w-0">
                  {capability && config ? (
                    <ImageSettings
                      capability={capability}
                      config={config}
                      disabled={archived || disabled || isSubmitting}
                      onChange={changeSettings}
                      section="advanced"
                    />
                  ) : (
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Choose a model to view its generation controls.
                    </p>
                  )}
                </div>

                <div className="text-xs leading-relaxed text-muted-foreground">
                  <p className="image-studio-control-label">Estimated cost</p>
                  <p className="mt-2">
                    {capability?.pricing.display ??
                      (capability?.pricing.kind === "unknown"
                        ? "Your provider reports the final price after generation."
                        : "Pricing appears when the selected model reports it.")}
                  </p>
                </div>
              </div>
            </section>
          ) : null}

          {validationNotice ? (
            <p
              className="mt-4 border-y border-amber-500/25 bg-amber-500/5 py-2.5 text-xs leading-relaxed text-amber-700 dark:text-amber-300"
              role="status"
            >
              {validationNotice}
            </p>
          ) : null}
          {submissionError ? (
            <p
              className="mt-4 border-y border-destructive/25 bg-destructive/5 py-2.5 text-xs leading-relaxed text-destructive"
              role="alert"
            >
              {submissionError}
            </p>
          ) : null}
          {archived ? (
            <p className="mt-4 text-xs text-muted-foreground">
              Restore this image thread to create more images.
            </p>
          ) : null}

          {capability?.options.styles?.length ? (
            <section aria-labelledby="quick-presets-title" className="mt-6">
              <h2 className="text-sm font-medium" id="quick-presets-title">
                Quick presets
              </h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {capability.options.styles.slice(0, 5).map((option) => (
                  <Button
                    aria-pressed={config?.style === option.value}
                    className="min-w-28"
                    disabled={archived || disabled || isSubmitting}
                    key={option.value}
                    onClick={() => changeSettings({ style: option.value })}
                    size="sm"
                    type="button"
                    variant={
                      config?.style === option.value ? "secondary" : "outline"
                    }
                  >
                    <Sparkles aria-hidden="true" />
                    {option.label}
                  </Button>
                ))}
              </div>
            </section>
          ) : null}

          <section
            aria-labelledby="image-examples-title"
            className="mt-7 border-t pt-6"
          >
            <h2 className="text-sm font-medium" id="image-examples-title">
              Try these examples
            </h2>
            <div className="image-studio-examples mt-3">
              {inspirationPrompts.map((example) => (
                <button
                  className="group flex min-w-0 items-center gap-3 border px-3 py-3 text-left transition-colors hover:border-foreground/25 hover:bg-muted/35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  disabled={archived || disabled}
                  key={example.label}
                  onClick={() => {
                    setPrompt(example.prompt)
                    requestAnimationFrame(() =>
                      document.getElementById("image-prompt")?.focus()
                    )
                  }}
                  type="button"
                >
                  <span className="grid size-9 shrink-0 place-items-center bg-muted text-muted-foreground">
                    <ImageIcon aria-hidden="true" className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {example.label}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {example.description}
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className="text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                  >
                    →
                  </span>
                </button>
              ))}
            </div>
          </section>
        </div>
      </main>

      <aside
        aria-label="Generated images"
        className="image-studio-results-panel min-h-0 min-w-0 overflow-y-auto border-l"
        data-testid="image-studio-results"
      >
        <div className="p-4 sm:p-5">
          <header className="flex items-center justify-between gap-3">
            <div>
              <p className="image-studio-kicker">Studio output</p>
              <h2 className="mt-1 text-base font-semibold">
                Recent generations
              </h2>
            </div>
            {hasGenerations ? (
              <span className="text-xs text-muted-foreground">
                {newestGenerations.length + legacyGenerations.length} in thread
              </span>
            ) : null}
          </header>

          {conversationId && generations === undefined ? (
            <div
              className="grid min-h-64 place-items-center text-sm text-muted-foreground"
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
          ) : hasGenerations ? (
            <div className="mt-4">
              {newestGenerations.map((generation) => (
                <GenerationSet
                  generation={generation}
                  key={generation._id}
                  onCancel={(generationSetId) => void cancel(generationSetId)}
                  onRetry={(generationSetId) => void retry(generationSetId)}
                  onReuse={reuseGeneration}
                  onUseAsReference={(output) =>
                    void useOutputAsReference(output)
                  }
                  retryDisabled={hasActiveGeneration}
                  variant="rail"
                />
              ))}
              {[...legacyGenerations].reverse().map((generation, index) => (
                <article
                  className="border-t py-5"
                  key={`${generation.createdAt}-${index}`}
                >
                  <p className="line-clamp-2 text-sm leading-relaxed font-medium">
                    {generation.prompt}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {generation.model} · Earlier generation
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {generation.images.map((image) => (
                      <div
                        className="group relative aspect-square overflow-hidden border bg-muted/30"
                        key={image.url}
                      >
                        <img
                          alt={generation.prompt}
                          className="size-full object-cover"
                          loading="lazy"
                          src={image.url}
                        />
                        <Button
                          aria-label={`Download ${image.name}`}
                          className="absolute right-2 bottom-2 bg-background/90 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
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
            </div>
          ) : (
            <section
              className="image-studio-empty-output mt-4"
              data-testid="image-studio-canvas"
            >
              <span className="relative grid size-12 place-items-center text-muted-foreground">
                <ImageIcon aria-hidden="true" className="size-8" />
                <Sparkles
                  aria-hidden="true"
                  className="absolute top-0 right-0 size-4 text-primary"
                />
              </span>
              <h3 className="mt-4 text-base font-semibold">
                Your next image appears here
              </h3>
              <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
                Describe an image, choose the model settings, and generate when
                you are ready.
              </p>
            </section>
          )}

          <section
            aria-labelledby="library-recent-title"
            className="mt-5 border-t pt-5"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-medium" id="library-recent-title">
                From your Library
              </h3>
              <Info
                aria-label="Recent generated images from your Library"
                className="size-3.5 text-muted-foreground"
              />
            </div>
            <RecentGenerationsCarousel layout="rail" />
          </section>
        </div>
      </aside>
    </div>
  )
}
