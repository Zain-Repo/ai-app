import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { cn } from "@/lib/utils"

import type {
  ImageGenerationConfig,
  ImageModelCapability,
} from "../../../shared/image-generation"

type ImageSettingsProps = {
  capability: ImageModelCapability
  config: ImageGenerationConfig
  disabled?: boolean
  onChange: (patch: Partial<ImageGenerationConfig>) => void
  section: "advanced" | "primary"
}

function SettingLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
      {children}
    </span>
  )
}

function getCountRange(
  capability: ImageModelCapability,
  config: ImageGenerationConfig
) {
  const multiplicity = capability.multiplicity
  const maximum =
    multiplicity.kind === "imagesPerRequest"
      ? Math.min(multiplicity.providerMax, multiplicity.appMax)
      : Math.min(
          multiplicity.generationMax,
          Math.floor(
            multiplicity.appMaxTotalOutputs /
              (config.maxImages ?? multiplicity.defaultMaxImages)
          )
        )
  const minimum =
    multiplicity.kind === "imagesPerRequest"
      ? multiplicity.providerMin
      : multiplicity.generationMin

  return Array.from(
    { length: Math.max(0, maximum - minimum + 1) },
    (_, index) => minimum + index
  )
}

export function ImageSettings({
  capability,
  config,
  disabled,
  onChange,
  section,
}: ImageSettingsProps) {
  const multiplicity = capability.multiplicity
  const counts = getCountRange(capability, config)

  if (section === "primary")
    return (
      <div className="grid gap-4">
        <div
          className={cn("grid gap-3", capability.resolutions && "grid-cols-2")}
        >
          <label className="grid min-w-0 gap-1.5">
            <SettingLabel>Aspect ratio</SettingLabel>
            <NativeSelect
              aria-label="Aspect ratio"
              disabled={disabled}
              onChange={(event) => onChange({ dimension: event.target.value })}
              value={config.dimension}
            >
              {capability.dimensions.options.map((option) => (
                <NativeSelectOption key={option.value} value={option.value}>
                  {option.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>

          {capability.resolutions ? (
            <label className="grid min-w-0 gap-1.5">
              <SettingLabel>Resolution</SettingLabel>
              <NativeSelect
                aria-label="Resolution"
                disabled={disabled}
                onChange={(event) =>
                  onChange({ resolution: event.target.value })
                }
                value={config.resolution}
              >
                {capability.resolutions.options.map((option) => (
                  <NativeSelectOption key={option.value} value={option.value}>
                    {option.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </label>
          ) : null}
        </div>

        <fieldset className="grid gap-1.5" disabled={disabled}>
          <legend>
            <SettingLabel>
              {multiplicity.kind === "imagesPerRequest"
                ? "Count"
                : "Generations"}
            </SettingLabel>
          </legend>
          <div
            className="grid overflow-hidden rounded-md border bg-background"
            style={{
              gridTemplateColumns: `repeat(${counts.length}, minmax(0, 1fr))`,
            }}
          >
            {counts.map((count, index) => (
              <label
                className={cn(
                  "grid h-9 cursor-pointer place-items-center text-xs font-medium transition-colors hover:bg-muted/60 has-checked:bg-primary has-checked:text-primary-foreground",
                  index > 0 && "border-l"
                )}
                key={count}
              >
                <input
                  checked={config.count === count}
                  className="sr-only"
                  name="image-count"
                  onChange={() => onChange({ count })}
                  type="radio"
                  value={count}
                />
                {count}
              </label>
            ))}
          </div>
        </fieldset>

        {multiplicity.kind === "generationsWithVariableImages" ? (
          <label className="grid gap-1.5">
            <SettingLabel>Max per generation</SettingLabel>
            <NativeSelect
              disabled={disabled}
              onChange={(event) =>
                onChange({ maxImages: Number(event.target.value) })
              }
              value={String(config.maxImages)}
            >
              {Array.from(
                {
                  length:
                    Math.min(
                      multiplicity.maxImagesMax,
                      Math.floor(multiplicity.appMaxTotalOutputs / config.count)
                    ) -
                    multiplicity.maxImagesMin +
                    1,
                },
                (_, index) => multiplicity.maxImagesMin + index
              ).map((count) => (
                <NativeSelectOption key={count} value={String(count)}>
                  {count}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
        ) : null}

        <label className="grid gap-1.5">
          <SettingLabel>Format</SettingLabel>
          <NativeSelect
            disabled={disabled}
            onChange={(event) =>
              onChange({
                outputFormat: event.target
                  .value as ImageGenerationConfig["outputFormat"],
              })
            }
            value={config.outputFormat}
          >
            {capability.options.outputFormats.map((format) => (
              <NativeSelectOption key={format} value={format}>
                {format.toUpperCase()}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
      </div>
    )

  const hasAdvancedSettings = Boolean(
    capability.options.qualities ||
    capability.options.backgrounds ||
    capability.options.styles ||
    capability.options.seed ||
    capability.options.promptExpansion
  )

  if (!hasAdvancedSettings)
    return (
      <p className="text-xs leading-relaxed text-muted-foreground">
        This model has no additional generation controls.
      </p>
    )

  return (
    <div className="grid gap-4">
      {capability.options.qualities ? (
        <label className="grid gap-1.5">
          <SettingLabel>Quality</SettingLabel>
          <NativeSelect
            disabled={disabled}
            onChange={(event) => onChange({ quality: event.target.value })}
            value={config.quality}
          >
            {capability.options.qualities.map((option) => (
              <NativeSelectOption key={option.value} value={option.value}>
                {option.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
      ) : null}

      {capability.options.backgrounds ? (
        <label className="grid gap-1.5">
          <SettingLabel>Background</SettingLabel>
          <NativeSelect
            disabled={disabled}
            onChange={(event) => onChange({ background: event.target.value })}
            value={config.background}
          >
            {capability.options.backgrounds.map((option) => (
              <NativeSelectOption key={option.value} value={option.value}>
                {option.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
      ) : null}

      {capability.options.styles ? (
        <label className="grid gap-1.5">
          <SettingLabel>Style</SettingLabel>
          <NativeSelect
            disabled={disabled}
            onChange={(event) => onChange({ style: event.target.value })}
            value={config.style}
          >
            {capability.options.styles.map((option) => (
              <NativeSelectOption key={option.value} value={option.value}>
                {option.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
      ) : null}

      {capability.options.seed ? (
        <label className="grid gap-1.5">
          <SettingLabel>Seed</SettingLabel>
          <Input
            disabled={disabled}
            inputMode="numeric"
            max={4_294_967_295}
            min={0}
            onChange={(event) =>
              onChange({
                seed: event.target.value
                  ? Number(event.target.value)
                  : undefined,
              })
            }
            placeholder="Random"
            type="number"
            value={config.seed ?? ""}
          />
        </label>
      ) : null}

      {capability.options.promptExpansion ? (
        <label className="flex min-h-12 cursor-pointer items-center justify-between gap-3 border-y py-3 text-sm">
          <span>
            <span className="block font-medium">Enhance prompt</span>
            <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
              Let the model add useful visual detail.
            </span>
          </span>
          <input
            checked={Boolean(config.promptExpansion)}
            className="size-4 accent-primary"
            disabled={disabled}
            onChange={(event) =>
              onChange({ promptExpansion: event.target.checked })
            }
            type="checkbox"
          />
        </label>
      ) : null}
    </div>
  )
}
