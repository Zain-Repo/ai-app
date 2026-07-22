"use client"

export interface QuickReplyItem {
  label: string
}

export function QuickReply({
  actions,
  data,
}: {
  actions?: { onSelectReply?: (reply: QuickReplyItem) => void }
  data: { replies: QuickReplyItem[] }
}) {
  return (
    <div className="flex w-full flex-wrap gap-2 rounded-lg bg-card p-4">
      {data.replies.map((reply, index) => (
        <button
          className="inline-flex cursor-pointer items-center rounded-full border border-border bg-background px-3 py-1.5 text-sm text-foreground transition-colors hover:border-foreground hover:bg-foreground hover:text-background"
          key={`${reply.label}-${index}`}
          onClick={() => actions?.onSelectReply?.(reply)}
          type="button"
        >
          {reply.label}
        </button>
      ))}
    </div>
  )
}
