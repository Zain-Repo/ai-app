import type { ComponentPropsWithoutRef } from "react"
import { useId } from "react"

import { cn } from "@/lib/utils"

type Dev3LogoMode = "adaptive" | "dark" | "light"

type Dev3MarkProps = Omit<ComponentPropsWithoutRef<"svg">, "color"> & {
  mode?: Dev3LogoMode
  title?: string
}

type Dev3LogoProps = ComponentPropsWithoutRef<"span"> & {
  markClassName?: string
  mode?: Dev3LogoMode
  variant?: "mark" | "wordmark"
}

const FOREGROUND_COLORS: Record<Dev3LogoMode, string> = {
  adaptive: "currentColor",
  dark: "#F6F6F3",
  light: "#0B0D12",
}

/**
 * The canonical Dev3 monogram. Its open D frames a routed numeral three,
 * preserving the product's single-surface and model-routing brand language.
 */
export function Dev3Mark({
  className,
  mode = "adaptive",
  title,
  ...props
}: Dev3MarkProps) {
  const gradientId = `dev3-route-${useId().replaceAll(":", "")}`

  return (
    <svg
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className={cn("shrink-0", className)}
      fill="none"
      role={title ? "img" : undefined}
      viewBox="0 0 120 120"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <linearGradient
          id={gradientId}
          x1="38"
          x2="80"
          y1="34"
          y2="96"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#00E5FF" />
          <stop offset="1" stopColor="#215BFF" />
        </linearGradient>
      </defs>

      <path
        d="M46 48H30V20H62C87 20 106 39 106 62C106 85 87 104 62 104H30V79H46"
        stroke={FOREGROUND_COLORS[mode]}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="9"
      />
      <path
        d="M42 35V44C42 47.314 44.686 50 48 50H60C70 50 76 55 76 62C76 69 70 74 61 74H56M61 74C71 74 77 79 77 86C77 94 70 99 60 99H52"
        stroke={`url(#${gradientId})`}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="8"
      />
      <circle cx="42" cy="35" fill="#00E5FF" r="5" />
      <circle cx="48" cy="53" fill="#215BFF" r="3.25" />

      <path
        d="M52 99H39V106"
        stroke={FOREGROUND_COLORS[mode]}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="8"
      />
      <path
        d="M39 99V106"
        stroke="#FFB020"
        strokeLinecap="round"
        strokeWidth="5"
      />
      <circle cx="39" cy="106" fill="#FFB020" r="5" />
    </svg>
  )
}

/** A compact brand lockup that can render either the mark or the full wordmark. */
export function Dev3Logo({
  "aria-label": ariaLabel,
  className,
  markClassName,
  mode = "adaptive",
  role,
  variant = "wordmark",
  ...props
}: Dev3LogoProps) {
  return (
    <span
      aria-label={ariaLabel ?? (variant === "mark" ? "Dev3" : undefined)}
      className={cn(
        "inline-flex items-center gap-2.5 font-heading font-semibold tracking-tight",
        className
      )}
      role={role ?? (variant === "mark" ? "img" : undefined)}
      {...props}
    >
      <Dev3Mark className={cn("size-8", markClassName)} mode={mode} />
      {variant === "wordmark" ? <span>Dev3</span> : null}
    </span>
  )
}
