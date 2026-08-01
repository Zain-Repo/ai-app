export const userMessageBubbleColorOptions = [
  {
    bubbleClassName: undefined,
    label: "Default",
    swatchClassName: "bg-primary",
    value: "default",
  },
  {
    bubbleClassName:
      "!bg-sky-700 !text-white dark:!bg-sky-400 dark:!text-slate-950",
    label: "Sky",
    swatchClassName: "bg-sky-700 dark:bg-sky-400",
    value: "sky",
  },
  {
    bubbleClassName:
      "!bg-violet-700 !text-white dark:!bg-violet-400 dark:!text-slate-950",
    label: "Violet",
    swatchClassName: "bg-violet-700 dark:bg-violet-400",
    value: "violet",
  },
  {
    bubbleClassName:
      "!bg-rose-700 !text-white dark:!bg-rose-400 dark:!text-slate-950",
    label: "Rose",
    swatchClassName: "bg-rose-700 dark:bg-rose-400",
    value: "rose",
  },
  {
    bubbleClassName:
      "!bg-emerald-700 !text-white dark:!bg-emerald-400 dark:!text-slate-950",
    label: "Emerald",
    swatchClassName: "bg-emerald-700 dark:bg-emerald-400",
    value: "emerald",
  },
  {
    bubbleClassName:
      "!bg-amber-600 !text-slate-950 dark:!bg-amber-300 dark:!text-slate-950",
    label: "Amber",
    swatchClassName: "bg-amber-600 dark:bg-amber-300",
    value: "amber",
  },
  {
    bubbleClassName:
      "!bg-slate-700 !text-white dark:!bg-slate-300 dark:!text-slate-950",
    label: "Slate",
    swatchClassName: "bg-slate-700 dark:bg-slate-300",
    value: "slate",
  },
] as const

export type UserMessageBubbleColor =
  (typeof userMessageBubbleColorOptions)[number]["value"]

export function resolveUserMessageBubbleColor(
  value: string | null | undefined
): UserMessageBubbleColor {
  return (
    userMessageBubbleColorOptions.find((option) => option.value === value)
      ?.value ?? "default"
  )
}

export function getUserMessageBubbleColorClassName(
  value: string | null | undefined
) {
  const color = resolveUserMessageBubbleColor(value)
  return userMessageBubbleColorOptions.find((option) => option.value === color)!
    .bubbleClassName
}
