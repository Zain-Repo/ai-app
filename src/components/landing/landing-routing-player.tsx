import { Player } from "@remotion/player"
import { useReducedMotion } from "motion/react"

import {
  Dev3RoutingReel,
  dev3RoutingReelMeta,
} from "@/remotion/Dev3RoutingReel"
import { cn } from "@/lib/utils"

type LandingRoutingPlayerProps = {
  className?: string
}

export function LandingRoutingPlayer({ className }: LandingRoutingPlayerProps) {
  const reduceMotion = useReducedMotion()

  return (
    <div
      className={cn(
        "landing-player overflow-hidden rounded-[1.5rem] border border-cinema-line/80 bg-cinema-surface shadow-[0_24px_60px_oklch(0_0_0/0.2)]",
        className
      )}
    >
      <Player
        component={Dev3RoutingReel}
        compositionWidth={dev3RoutingReelMeta.width}
        compositionHeight={dev3RoutingReelMeta.height}
        durationInFrames={dev3RoutingReelMeta.durationInFrames}
        fps={dev3RoutingReelMeta.fps}
        style={{ width: "100%", aspectRatio: "16 / 9", display: "block" }}
        controls={false}
        loop
        autoPlay={!reduceMotion}
        clickToPlay={false}
        doubleClickToFullscreen={false}
        acknowledgeRemotionLicense
      />
    </div>
  )
}
