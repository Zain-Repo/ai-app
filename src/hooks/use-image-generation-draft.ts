import { useEffect, useState } from "react"

import {
  getDefaultImageGenerationConfig,
  validateImageGenerationConfig,
} from "../../shared/image-generation"
import type {
  ImageGenerationConfig,
  ImageModelCapability,
} from "../../shared/image-generation"

export function useImageGenerationDraft(
  capability: ImageModelCapability | null
) {
  const [draft, setDraft] = useState<{
    config: ImageGenerationConfig | null
    validationNotice: string
  }>({ config: null, validationNotice: "" })

  useEffect(() => {
    if (!capability) {
      setDraft({ config: null, validationNotice: "" })
      return
    }
    setDraft((current) => {
      const defaults = getDefaultImageGenerationConfig(capability)
      if (!current.config) return { config: defaults, validationNotice: "" }
      try {
        const next = validateImageGenerationConfig(capability, {
          ...defaults,
          dimension: current.config.dimension,
          count: current.config.count,
          outputFormat: current.config.outputFormat,
          ...(current.config.resolution
            ? { resolution: current.config.resolution }
            : {}),
          ...(current.config.maxImages
            ? { maxImages: current.config.maxImages }
            : {}),
          ...(current.config.quality
            ? { quality: current.config.quality }
            : {}),
          ...(current.config.background
            ? { background: current.config.background }
            : {}),
          ...(current.config.seed === undefined
            ? {}
            : { seed: current.config.seed }),
          ...(current.config.style ? { style: current.config.style } : {}),
          ...(current.config.promptExpansion === undefined
            ? {}
            : { promptExpansion: current.config.promptExpansion }),
        })
        return { config: next, validationNotice: "" }
      } catch {
        return {
          config: defaults,
          validationNotice:
            "Settings were reset to values supported by the selected model.",
        }
      }
    })
  }, [capability])

  const updateConfig = (patch: Partial<ImageGenerationConfig>) => {
    if (!capability) return
    setDraft((current) => {
      const next = {
        ...(current.config ?? getDefaultImageGenerationConfig(capability)),
        ...patch,
      }
      return {
        config: validateImageGenerationConfig(capability, next),
        validationNotice: "",
      }
    })
  }

  return {
    config: draft.config,
    setConfig: (config: ImageGenerationConfig) =>
      setDraft({ config, validationNotice: "" }),
    updateConfig,
    validationNotice: draft.validationNotice,
  }
}
