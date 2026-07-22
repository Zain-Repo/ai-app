import { Check } from "lucide-react"

import { cn } from "@/lib/utils"

export interface ProgressStep {
  label: string
  status: "completed" | "current" | "pending"
}

export function ProgressSteps({ data }: { data: { steps: ProgressStep[] } }) {
  return (
    <ol className="flex flex-col gap-2 rounded-lg bg-card p-4 sm:flex-row sm:items-center">
      {data.steps.map((step, index) => (
        <li className="flex items-center gap-2" key={`${step.label}-${index}`}>
          <span className="flex items-center gap-2">
            <span
              className={cn(
                "flex size-5 shrink-0 items-center justify-center rounded-full text-xs",
                step.status === "completed" && "bg-foreground text-background",
                step.status === "current" && "border-2 border-foreground",
                step.status === "pending" && "border border-muted-foreground/40"
              )}
            >
              {step.status === "completed" ? (
                <Check className="size-3" aria-hidden="true" />
              ) : null}
            </span>
            <span
              aria-current={step.status === "current" ? "step" : undefined}
              className={cn(
                "text-sm",
                step.status === "current" && "font-medium",
                step.status === "pending" && "text-muted-foreground"
              )}
            >
              {step.label}
            </span>
          </span>
          {index < data.steps.length - 1 ? (
            <span className="hidden h-px w-4 bg-border sm:block" />
          ) : null}
        </li>
      ))}
    </ol>
  )
}
