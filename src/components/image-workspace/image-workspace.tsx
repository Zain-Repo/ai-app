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

const inspirationPrompt =
  "Create a refined product scene with directional studio light, subtle shadows, and generous negative space."

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
  const [settingsOpen, setSettingsOpen] = useState(true)
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
    <div
      className={`image-workspace image-studio-grid min-h-0 flex-1 overflow-hidden ${settingsOpen ? "is-settings-open" : ""}`}
    >
      <aside
        aria-label="Image creation controls"
        className="image-studio-create-panel flex min-h-0 flex-col border-r bg-background"
      >
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
          <p className="text-[10px] font-semibold tracking-[0.16em] text-foreground/80 uppercase">
            Create
          </p>

          <label className="mt-4 grid">
            <span className="sr-only">Image prompt</span>
            <span className="relative">
              <Textarea
                aria-describedby="image-prompt-help"
                aria-label="Image prompt"
                className="min-h-44 resize-none rounded-md border-border bg-background px-3.5 pt-3.5 pb-10 text-sm leading-relaxed shadow-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
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
              <Button
                aria-label="Use an example prompt"
                className="absolute bottom-2 left-2 text-muted-foreground"
                disabled={archived || disabled}
                onClick={() => {
                  setPrompt(inspirationPrompt)
                  requestAnimationFrame(() =>
                    document.getElementById("image-prompt")?.focus()
                  )
                }}
                size="icon-xs"
                type="button"
                variant="ghost"
              >
                <WandSparkles aria-hidden="true" />
              </Button>
              <span className="absolute right-3 bottom-3 text-[10px] text-muted-foreground tabular-nums">
                {prompt.length}/8000
              </span>
            </span>
            <span className="sr-only" id="image-prompt-help">
              Control or Command plus Enter to generate
            </span>
          </label>

          {capability && capability.references.max > 0 ? (
            <div className="mt-5">
              <ReferenceStrip
                disabled={archived || disabled || isSubmitting}
                limit={capability.references.max}
                onChange={setReferences}
                references={references}
              />
            </div>
          ) : null}

          <div className="mt-5 grid gap-4">
            {providers.length ? (
              <label className="grid gap-1.5">
                <span className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                  Model
                </span>
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
                className="w-full justify-center"
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
                className="flex items-center gap-2 border-y py-3 text-xs text-muted-foreground"
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
                className="border-y border-destructive/30 py-3 text-xs leading-relaxed text-destructive"
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
          </div>

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
        </div>

        <div className="grid shrink-0 grid-cols-[auto_minmax(0,1fr)] gap-2 border-t bg-background p-4">
          <Button
            aria-controls="image-settings-panel"
            aria-expanded={settingsOpen}
            className="h-10 rounded-md px-3"
            disabled={!capability || !config}
            onClick={() => setSettingsOpen((open) => !open)}
            type="button"
            variant="outline"
          >
            <Settings2 aria-hidden="true" />
            Settings
          </Button>
          <Button
            className="h-10 rounded-md text-sm"
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
      </aside>

      <main
        aria-label="Generated images"
        className="image-studio-canvas-panel flex min-h-0 min-w-0 flex-col bg-background"
      >
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
        ) : hasGenerations ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
            <div className="mx-auto w-full max-w-5xl">
              <p className="mb-2 text-[10px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
                Recent generations
              </p>
              {legacyGenerations.map((generation, index) => (
                <article
                  className="border-t py-6 first:border-t-0"
                  key={`${generation.createdAt}-${index}`}
                >
                  <header className="mb-4 max-w-2xl">
                    <p className="line-clamp-2 text-sm leading-relaxed font-medium">
                      {generation.prompt}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {generation.model} · Earlier generation
                    </p>
                  </header>
                  <div
                    className={
                      generation.images.length === 1
                        ? "grid max-w-2xl grid-cols-1 gap-3"
                        : "grid grid-cols-1 gap-3 sm:grid-cols-2"
                    }
                  >
                    {generation.images.map((image) => (
                      <div
                        className="group relative overflow-hidden rounded-md border bg-muted/30"
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
                  onUseAsReference={(output) =>
                    void useOutputAsReference(output)
                  }
                  retryDisabled={hasActiveGeneration}
                />
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 p-4 pb-3">
              <section
                className="grid h-full min-h-72 place-items-center rounded-md border bg-background px-6 py-8 text-center"
                data-testid="image-studio-canvas"
              >
                <div className="max-w-sm">
                  <span className="relative mx-auto grid size-16 place-items-center text-muted-foreground">
                    <ImageIcon aria-hidden="true" className="size-10" />
                    <Sparkles
                      aria-hidden="true"
                      className="absolute top-0 right-0 size-5 text-primary"
                    />
                  </span>
                  <h1 className="mt-4 font-heading text-xl font-medium tracking-tight">
                    Your canvas is ready
                  </h1>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Describe your image on the left, add references, and
                    generate to see it here.
                  </p>
                </div>
              </section>
            </div>

            <section
              aria-labelledby="image-variations-title"
              className="shrink-0 px-4 pb-4"
            >
              <div className="mb-2 flex items-center gap-1.5">
                <h2 className="text-xs font-medium" id="image-variations-title">
                  Recent / Variations
                </h2>
                <Info
                  aria-label="Generated variations will appear here"
                  className="size-3.5 text-muted-foreground"
                />
              </div>
              <div className="grid grid-cols-4 gap-2">
                {Array.from({ length: 4 }, (_, index) => (
                  <div
                    aria-hidden="true"
                    className="grid min-h-24 place-items-center rounded-md border bg-muted/10 text-muted-foreground sm:min-h-28"
                    key={index}
                  >
                    <ImageIcon className="size-5" />
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </main>

      {settingsOpen ? (
        <aside
          aria-label="Image settings"
          className="image-studio-settings-panel flex min-h-0 flex-col border-l bg-background"
          id="image-settings-panel"
        >
          <header className="flex h-14 shrink-0 items-center justify-between border-b px-4">
            <h2 className="text-[10px] font-semibold tracking-[0.16em] uppercase">
              Settings
            </h2>
            <Button
              className="h-8 px-2 text-xs text-muted-foreground"
              disabled={!capability || !config || isSubmitting}
              onClick={resetSettings}
              type="button"
              variant="ghost"
            >
              Reset
              <RotateCcw aria-hidden="true" className="size-3.5" />
            </Button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
            {providers.length ? (
              <section aria-labelledby="image-routing-title">
                <h3
                  className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground uppercase"
                  id="image-routing-title"
                >
                  Model routing
                </h3>
                <div className="mt-3 grid gap-3">
                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium">Provider</span>
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
                      <span className="text-xs font-medium">Route</span>
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
              </section>
            ) : null}

            <section
              aria-labelledby="advanced-image-settings-title"
              className="mt-6 border-t pt-5"
            >
              <h3
                className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground uppercase"
                id="advanced-image-settings-title"
              >
                Generation
              </h3>
              <div className="mt-3">
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
            </section>

            {capability?.pricing.display ? (
              <section className="mt-6 border-t pt-5">
                <h3 className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
                  Estimated cost
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {capability.pricing.display}
                </p>
              </section>
            ) : capability?.pricing.kind === "unknown" ? (
              <p className="mt-6 border-t pt-5 text-xs leading-relaxed text-muted-foreground">
                Your provider reports the final price after generation.
              </p>
            ) : null}
          </div>
        </aside>
      ) : null}
    </div>
  )
}
