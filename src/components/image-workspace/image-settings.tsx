import { ChevronDown } from "lucide-react"

import type {
  ImageGenerationConfig,
  ImageModelCapability,
} from "../../../shared/image-generation"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"

type ImageSettingsProps = {
  capability: ImageModelCapability
  config: ImageGenerationConfig
  disabled?: boolean
  onChange: (patch: Partial<ImageGenerationConfig>) => void
}

function SettingLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
      {children}
    </span>
  )
}

export function ImageSettings({
  capability,
  config,
  disabled,
  onChange,
}: ImageSettingsProps) {
  const multiplicity = capability.multiplicity
  const countMax =
    multiplicity.kind === "imagesPerRequest"
      ? Math.min(multiplicity.providerMax, multiplicity.appMax)
      : Math.min(
          multiplicity.generationMax,
          Math.floor(
            multiplicity.appMaxTotalOutputs /
              (config.maxImages ?? multiplicity.defaultMaxImages)
          )
        )
  const countMin =
    multiplicity.kind === "imagesPerRequest"
      ? multiplicity.providerMin
      : multiplicity.generationMin

  return (
    <div className="grid gap-5">
      <fieldset className="grid gap-2.5" disabled={disabled}>
        <legend>
          <SettingLabel>Aspect ratio</SettingLabel>
        </legend>
        <div className="grid grid-cols-3 gap-2">
          {capability.dimensions.options.map((option) => (
            <label
              className="group cursor-pointer rounded-lg border bg-background p-2.5 text-center transition-colors hover:bg-muted/60 has-checked:border-foreground/40 has-checked:bg-muted/40"
              key={option.value}
            >
              <input
                checked={config.dimension === option.value}
                className="sr-only"
                name="image-dimension"
                onChange={() => onChange({ dimension: option.value })}
                type="radio"
                value={option.value}
              />
              <span
                aria-hidden="true"
                className="mx-auto mb-2 block max-h-7 min-h-3 min-w-3 rounded-[3px] border border-current text-muted-foreground group-has-checked:text-foreground"
                style={{
                  aspectRatio: `${option.width} / ${option.height}`,
                  width: `${Math.max(
                    12,
                    Math.min(28, (option.width / option.height) * 22)
                  )}px`,
                }}
              />
              <span className="line-clamp-2 text-[11px] leading-tight font-medium">
                {option.label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        {capability.resolutions ? (
          <label className="grid gap-1.5">
            <SettingLabel>Resolution</SettingLabel>
            <NativeSelect
              disabled={disabled}
              onChange={(event) => onChange({ resolution: event.target.value })}
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
        <label className="grid gap-1.5">
          <SettingLabel>
            {multiplicity.kind === "imagesPerRequest"
              ? "Images"
              : "Generations"}
          </SettingLabel>
          <NativeSelect
            disabled={disabled}
            onChange={(event) =>
              onChange({ count: Number(event.target.value) })
            }
            value={String(config.count)}
          >
            {Array.from(
              { length: Math.max(0, countMax - countMin + 1) },
              (_, index) => countMin + index
            ).map((count) => (
              <NativeSelectOption key={count} value={String(count)}>
                {count}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
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

      <details className="group border-t pt-4">
        <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
          Advanced settings
          <ChevronDown
            aria-hidden="true"
            className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none"
          />
        </summary>
        <div className="mt-4 grid grid-cols-2 gap-3">
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
                onChange={(event) =>
                  onChange({ background: event.target.value })
                }
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
            <label className="col-span-2 grid gap-1.5">
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
            <label className="col-span-2 grid gap-1.5">
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
            <label className="col-span-2 flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
              <span>
                <span className="block font-medium">Enhance prompt</span>
                <span className="block text-xs text-muted-foreground">
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
      </details>
    </div>
  )
}
