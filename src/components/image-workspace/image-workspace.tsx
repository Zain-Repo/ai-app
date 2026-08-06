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
    <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[380px_minmax(0,1fr)]">
      <aside className="z-10 border-b bg-background lg:min-h-0 lg:border-r lg:border-b-0">
        <div className="grid gap-5 p-4 sm:p-5 lg:h-full lg:overflow-y-auto lg:p-6">
          <header>
            <p className="text-[11px] font-semibold tracking-[0.22em] text-muted-foreground uppercase">
              Image studio
            </p>
            <h1 className="mt-2 font-heading text-2xl font-light tracking-tight text-foreground">
              Create an image
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Describe a scene, choose a model, and shape the result in one
              quiet workspace.
            </p>
          </header>

          {providers.length ? (
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border">
              <label className="grid gap-1.5 bg-background p-3">
                <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                  Provider
                </span>
                <NativeSelect
                  disabled={Boolean(conversationId) || isSubmitting}
                  onChange={(event) =>
                    onProviderChange(event.target.value as ImageProvider)
                  }
                  value={provider}
                  className="w-full"
                >
                  {providers.map((option) => (
                    <NativeSelectOption key={option.value} value={option.value}>
                      {option.label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </label>
              <label className="grid gap-1.5 bg-background p-3">
                <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                  Model
                </span>
                <NativeSelect
                  disabled={isSubmitting || !models.length}
                  onChange={(event) => onModelChange(event.target.value)}
                  value={modelId}
                  className="w-full"
                >
                  {models.map((model) => (
                    <NativeSelectOption key={model.value} value={model.value}>
                      {model.label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </label>
            </div>
          ) : (
            <div className="rounded-xl border bg-muted/30 p-4">
              <p className="text-sm font-medium">Connect an image provider</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Dev3 supports OpenRouter and fal image models.
              </p>
              <Button
                className="mt-3 rounded-lg"
                onClick={onConnectProvider}
                size="sm"
                type="button"
                variant="outline"
              >
                <Plug aria-hidden="true" />
                Connect provider
              </Button>
            </div>
          )}

          {provider === "openrouter" && routingOptions.length ? (
            <label className="grid gap-1.5">
              <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                Route
              </span>
              <NativeSelect
                disabled={isSubmitting}
                onChange={(event) =>
                  onRoutingProviderChange(event.target.value)
                }
                value={capabilityRoutingProvider ?? "auto"}
                className="w-full"
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

          <label className="grid gap-1.5">
            <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              Prompt
            </span>
            <Textarea
              aria-describedby="image-prompt-help"
              className="min-h-32 rounded-[14px] border-border/70 bg-muted/30 leading-relaxed"
              disabled={archived || disabled}
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
            <span
              className="text-[11px] text-muted-foreground"
              id="image-prompt-help"
            >
              Ctrl/⌘ + Enter to generate
            </span>
          </label>

          {capability && config ? (
            <>
              <ReferenceStrip
                disabled={archived || disabled || isSubmitting}
                limit={capability.references.max}
                onChange={setReferences}
                references={references}
              />
              <div className="hidden lg:block">
                <ImageSettings
                  capability={capability}
                  config={config}
                  disabled={archived || disabled || isSubmitting}
                  onChange={changeSettings}
                />
              </div>
              <details className="group rounded-xl border bg-muted/20 p-4 lg:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
                  <span>
                    Image settings
                    <span className="ml-2 font-normal text-muted-foreground">
                      {config.dimension} · {config.count}{" "}
                      {config.count === 1 ? "image" : "images"}
                    </span>
                  </span>
                  <ChevronDown
                    aria-hidden="true"
                    className="size-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
                  />
                </summary>
                <div className="mt-5">
                  <ImageSettings
                    capability={capability}
                    config={config}
                    disabled={archived || disabled || isSubmitting}
                    onChange={changeSettings}
                  />
                </div>
              </details>
            </>
          ) : capabilityState === "loading" || capability ? (
            <div
              className="flex items-center gap-2 py-5 text-sm text-muted-foreground"
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
              className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs leading-relaxed text-destructive"
              role="alert"
            >
              {capabilityError}
            </p>
          ) : null}

          {capability?.pricing.display ? (
            <p className="text-xs text-muted-foreground">
              Estimated provider price: {capability.pricing.display}
            </p>
          ) : capability?.pricing.kind === "unknown" ? (
            <p className="text-xs text-muted-foreground">
              Price shown by your provider after generation.
            </p>
          ) : null}
          {validationNotice ? (
            <p
              className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-700 dark:text-amber-300"
              role="status"
            >
              {validationNotice}
            </p>
          ) : null}
          {submissionError ? (
            <p
              className="rounded-lg bg-destructive/8 px-3 py-2 text-xs leading-relaxed text-destructive"
              role="alert"
            >
              {submissionError}
            </p>
          ) : null}
          {archived ? (
            <p className="text-xs text-muted-foreground">
              Restore this image thread to create more images.
            </p>
          ) : null}

          <div className="sticky bottom-0 -mx-4 mt-auto border-t bg-background/95 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur sm:-mx-5 sm:px-5 lg:-mx-6 lg:px-6">
            <Button
              className="h-11 w-full rounded-lg"
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
      </aside>

      <main
        className="min-h-0 flex-1 overflow-y-auto"
        aria-label="Generated images"
      >
        {conversationId && generations === undefined ? (
          <div
            className="grid min-h-72 place-items-center text-sm text-muted-foreground"
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
          <div className="mx-auto w-full max-w-6xl px-4 py-2 sm:px-6 lg:px-10">
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
          <div className="grid min-h-[55svh] place-items-center px-6 py-16 text-center">
            <div className="max-w-sm">
              <span className="mx-auto grid size-12 place-items-center rounded-full border bg-muted/40">
                <ImageIcon
                  aria-hidden="true"
                  className="size-5 text-muted-foreground"
                />
              </span>
              <h2 className="mt-5 font-heading text-xl font-light tracking-tight">
                Your generations will appear here
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Describe a scene, set your format, and generate. Every output is
                kept in this thread so you can reuse or refine it.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
