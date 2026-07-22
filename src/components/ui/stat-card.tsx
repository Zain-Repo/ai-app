import { Minus, TrendingDown, TrendingUp } from "lucide-react"

import { cn } from "@/lib/utils"

export interface StatCardItem {
  change?: number
  changeLabel?: string
  label: string
  trend?: "down" | "neutral" | "up"
  value: number | string
}

export function StatCard({ data }: { data: { stats: StatCardItem[] } }) {
  return (
    <dl className="grid w-full grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-4">
      {data.stats.map((stat, index) => {
        const TrendIcon =
          stat.trend === "up"
            ? TrendingUp
            : stat.trend === "down"
              ? TrendingDown
              : Minus
        const trendLabel =
          stat.trend === "up"
            ? "increase"
            : stat.trend === "down"
              ? "decrease"
              : "no change"

        return (
          <div
            className="space-y-1 rounded-lg border bg-card p-3"
            key={`${stat.label}-${index}`}
          >
            <dt className="text-xs text-muted-foreground">{stat.label}</dt>
            <dd className="flex flex-wrap items-baseline gap-2">
              <span className="text-xl font-bold">{stat.value}</span>
              {stat.change !== undefined ? (
                <span
                  className={cn(
                    "flex items-center gap-0.5 text-xs font-medium",
                    stat.trend === "up" && "text-green-600",
                    stat.trend === "down" && "text-red-600",
                    (!stat.trend || stat.trend === "neutral") &&
                      "text-muted-foreground"
                  )}
                >
                  <TrendIcon className="size-3.5" aria-hidden="true" />
                  <span className="sr-only">{trendLabel}</span>
                  {Math.abs(stat.change)}%
                </span>
              ) : null}
            </dd>
            {stat.changeLabel ? (
              <dd className="text-xs text-muted-foreground">
                {stat.changeLabel}
              </dd>
            ) : null}
          </div>
        )
      })}
    </dl>
  )
}
