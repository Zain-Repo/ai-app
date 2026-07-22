import { z } from "zod"

export const RENDER_UI_TOOL_NAME = "render_ui"
export const MAX_GENERATIVE_UI_PAYLOAD_LENGTH = 20_000

const shortText = z.string().trim().min(1).max(160)
const title = shortText.optional()
const tableCell = z.union([
  z.string().max(500),
  z.number(),
  z.boolean(),
  z.null(),
])

const statsUiSchema = z
  .object({
    kind: z.literal("stats"),
    title,
    stats: z
      .array(
        z
          .object({
            label: shortText,
            value: z.union([z.string().max(120), z.number()]),
            change: z.number().min(-10_000).max(10_000).optional(),
            changeLabel: shortText.optional(),
            trend: z.enum(["up", "down", "neutral"]).optional(),
          })
          .strict()
      )
      .min(1)
      .max(6),
  })
  .strict()

const tableUiSchema = z
  .object({
    kind: z.literal("table"),
    title,
    columns: z
      .array(
        z
          .object({
            key: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/),
            label: shortText,
          })
          .strict()
      )
      .min(1)
      .max(8),
    rows: z
      .array(z.record(z.string().max(40), tableCell))
      .min(1)
      .max(20),
  })
  .strict()

const quickRepliesUiSchema = z
  .object({
    kind: z.literal("quick-replies"),
    title,
    replies: z
      .array(z.object({ label: shortText }).strict())
      .min(1)
      .max(6),
  })
  .strict()

const optionsUiSchema = z
  .object({
    kind: z.literal("options"),
    title,
    multiple: z.boolean().optional(),
    options: z
      .array(
        z
          .object({
            description: shortText.optional(),
            label: shortText,
          })
          .strict()
      )
      .min(1)
      .max(8),
  })
  .strict()

const progressUiSchema = z
  .object({
    kind: z.literal("progress"),
    title,
    steps: z
      .array(
        z
          .object({
            label: shortText,
            status: z.enum(["completed", "current", "pending"]),
          })
          .strict()
      )
      .min(1)
      .max(8),
  })
  .strict()

export const generativeUiSchema = z.discriminatedUnion("kind", [
  statsUiSchema,
  tableUiSchema,
  quickRepliesUiSchema,
  optionsUiSchema,
  progressUiSchema,
])

export const renderUiToolInputSchema = z
  .object({ ui: generativeUiSchema })
  .strict()

export const renderUiToolDescription =
  "Render a compact interface when structured visual output is more useful than prose. Use only facts already present in the conversation or tool results. Use stats for metrics, table for comparisons, quick-replies or options for useful user choices, and progress for sequential status or plans."

export const renderUiToolJsonSchema = z.toJSONSchema(renderUiToolInputSchema, {
  target: "draft-7",
})

export type GenerativeUi = z.infer<typeof generativeUiSchema>

export function serializeGenerativeUi(value: unknown) {
  const parsed = generativeUiSchema.safeParse(value)
  if (!parsed.success) return null
  const payload = JSON.stringify(parsed.data)
  return payload.length <= MAX_GENERATIVE_UI_PAYLOAD_LENGTH ? payload : null
}

export function parseGenerativeUiPayload(payload?: string) {
  if (!payload || payload.length > MAX_GENERATIVE_UI_PAYLOAD_LENGTH) return null
  try {
    const parsed = generativeUiSchema.safeParse(JSON.parse(payload))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
