import { cn } from "@/lib/utils"

export function WorkspaceHistoryPartialNotice({
  className,
  items,
  partial,
}: {
  className?: string
  items: string
  partial: boolean
}) {
  return (
    <p
      className={
        partial
          ? cn(
              "rounded-lg bg-muted/55 px-3 py-2 text-xs text-muted-foreground",
              className
            )
          : "sr-only"
      }
      role="status"
    >
      {partial
        ? `Some older ${items} are temporarily unavailable while history finishes syncing.`
        : null}
    </p>
  )
}
