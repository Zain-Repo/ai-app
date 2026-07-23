import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion"

const STAGES = [
  {
    id: "01",
    title: "Connect",
    detail: "Provider access stays yours",
    signal: "OpenRouter",
  },
  {
    id: "02",
    title: "Compose",
    detail: "One workspace, stable thread",
    signal: "Project context",
  },
  {
    id: "03",
    title: "Route",
    detail: "Pick the model for the job",
    signal: "Model switch",
  },
  {
    id: "04",
    title: "Inspect",
    detail: "Compare without losing flow",
    signal: "Run history",
  },
] as const

const COLORS = {
  bg: "#15181d",
  surface: "#1d2229",
  line: "rgba(232, 237, 243, 0.12)",
  ivory: "#edf1f5",
  muted: "rgba(220, 226, 233, 0.62)",
  accent: "#78a9e6",
  accentSoft: "rgba(120, 169, 230, 0.18)",
}

function stageWindow(frame: number, fps: number, index: number) {
  const start = Math.round(index * 1.55 * fps)
  const enter = spring({
    frame: frame - start,
    fps,
    config: { damping: 200 },
  })
  const active = interpolate(
    frame,
    [start, start + Math.round(0.45 * fps), start + Math.round(1.35 * fps)],
    [0, 1, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }
  )
  return { enter, active, start }
}

export function HarnessRoutingReel() {
  const frame = useCurrentFrame()
  const { fps, width, height } = useVideoConfig()

  const titleProgress = spring({
    frame,
    fps,
    config: { damping: 200 },
  })
  const scanX = interpolate(
    frame % Math.round(5 * fps),
    [0, Math.round(5 * fps)],
    [-8, 108],
    {
      easing: Easing.inOut(Easing.cubic),
    }
  )
  const pulse = interpolate(
    frame % Math.round(2.4 * fps),
    [0, Math.round(1.2 * fps), Math.round(2.4 * fps)],
    [0.35, 1, 0.35],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  )
  const activeIndex = Math.min(
    STAGES.length - 1,
    Math.floor(frame / Math.round(1.55 * fps))
  )
  const typed = "Route work without rebuilding the room.".slice(
    0,
    Math.floor(
      interpolate(frame, [8, 8 + 34 * 1.6], [0, 38], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    )
  )

  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.bg,
        color: COLORS.ivory,
        fontFamily:
          '"Outfit Variable", Outfit, ui-sans-serif, system-ui, sans-serif',
        overflow: "hidden",
      }}
    >
      <AbsoluteFill
        style={{
          backgroundImage: `
            radial-gradient(circle at 18% 18%, rgba(120,169,230,0.12), transparent 28%),
            radial-gradient(circle at 82% 12%, rgba(237,241,245,0.04), transparent 24%),
            linear-gradient(180deg, rgba(255,255,255,0.02), transparent 40%)
          `,
        }}
      />

      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.18,
          backgroundImage:
            "linear-gradient(rgba(232,237,243,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(232,237,243,0.07) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage:
            "radial-gradient(circle at center, black 28%, transparent 78%)",
        }}
      />

      <div
        style={{
          position: "absolute",
          top: 36,
          left: 40,
          right: 40,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          opacity: titleProgress,
          transform: `translateY(${interpolate(titleProgress, [0, 1], [18, 0])}px)`,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 12,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: COLORS.accent,
              marginBottom: 10,
              fontWeight: 600,
            }}
          >
            AI Harness · live path
          </div>
          <div
            style={{
              fontSize: 34,
              lineHeight: 1.05,
              letterSpacing: "-0.03em",
              fontWeight: 600,
              maxWidth: 520,
            }}
          >
            {typed}
            <span
              style={{
                display: "inline-block",
                width: 2,
                height: "0.9em",
                marginLeft: 4,
                background: COLORS.accent,
                opacity: Math.round(frame / 8) % 2,
                verticalAlign: "text-bottom",
              }}
            />
          </div>
        </div>
        <div
          style={{
            textAlign: "right",
            color: COLORS.muted,
            fontSize: 13,
            letterSpacing: "0.04em",
          }}
        >
          <div>FRAME {String(frame).padStart(3, "0")}</div>
          <div style={{ marginTop: 6 }}>
            {width}×{height} · {fps}fps
          </div>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 40,
          right: 40,
          top: height * 0.34,
          height: 2,
          background: COLORS.line,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -1,
            left: `${scanX}%`,
            width: 120,
            height: 4,
            borderRadius: 999,
            background: `linear-gradient(90deg, transparent, ${COLORS.accent}, transparent)`,
            boxShadow: `0 0 18px ${COLORS.accent}`,
            opacity: pulse,
          }}
        />
      </div>

      <div
        style={{
          position: "absolute",
          left: 40,
          right: 40,
          top: height * 0.28,
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: 18,
        }}
      >
        {STAGES.map((stage, index) => {
          const { enter, active } = stageWindow(frame, fps, index)
          const isActive = index === activeIndex
          return (
            <div
              key={stage.id}
              style={{
                position: "relative",
                minHeight: 168,
                borderRadius: 18,
                border: `1px solid ${
                  isActive ? "rgba(120,169,230,0.45)" : COLORS.line
                }`,
                background: isActive
                  ? "linear-gradient(180deg, rgba(120,169,230,0.12), rgba(29,34,41,0.94))"
                  : COLORS.surface,
                padding: 18,
                opacity: interpolate(enter, [0, 1], [0.28, 1]),
                transform: `translateY(${interpolate(enter, [0, 1], [24, 0])}px) scale(${
                  isActive ? 1.02 : 0.985
                })`,
                boxShadow: isActive ? "0 18px 40px rgba(0,0,0,0.35)" : "none",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 28,
                  color: COLORS.muted,
                  fontSize: 12,
                  letterSpacing: "0.12em",
                }}
              >
                <span>{stage.id}</span>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: isActive
                      ? COLORS.accent
                      : "rgba(232,237,243,0.2)",
                    boxShadow: isActive ? `0 0 12px ${COLORS.accent}` : "none",
                    opacity: isActive ? pulse : 1,
                  }}
                />
              </div>
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 600,
                  letterSpacing: "-0.03em",
                  marginBottom: 8,
                }}
              >
                {stage.title}
              </div>
              <div
                style={{ color: COLORS.muted, fontSize: 14, lineHeight: 1.4 }}
              >
                {stage.detail}
              </div>
              <div
                style={{
                  position: "absolute",
                  left: 18,
                  right: 18,
                  bottom: 16,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: isActive ? COLORS.accent : COLORS.muted,
                  }}
                >
                  {stage.signal}
                </span>
                <span
                  style={{
                    height: 2,
                    flex: 1,
                    maxWidth: 54,
                    borderRadius: 999,
                    background: COLORS.accentSoft,
                    transform: `scaleX(${active})`,
                    transformOrigin: "left center",
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>

      <div
        style={{
          position: "absolute",
          left: 40,
          right: 40,
          bottom: 34,
          display: "grid",
          gridTemplateColumns: "1.2fr 1fr",
          gap: 18,
          alignItems: "end",
        }}
      >
        <div
          style={{
            borderRadius: 16,
            border: `1px solid ${COLORS.line}`,
            background: "rgba(29,34,41,0.9)",
            padding: "16px 18px",
            display: "grid",
            gap: 10,
          }}
        >
          <div
            style={{
              fontSize: 11,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: COLORS.muted,
            }}
          >
            Active route
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              fontSize: 18,
              fontWeight: 600,
              letterSpacing: "-0.02em",
            }}
          >
            <span>{STAGES[activeIndex]?.title}</span>
            <span style={{ color: COLORS.accent }}>→</span>
            <span style={{ color: COLORS.muted }}>
              {STAGES[activeIndex]?.signal}
            </span>
          </div>
        </div>
        <div
          style={{
            justifySelf: "end",
            textAlign: "right",
            color: COLORS.muted,
            fontSize: 13,
            lineHeight: 1.5,
            maxWidth: 280,
          }}
        >
          The harness holds identity, provider adapters, and run history while
          the model stays replaceable.
        </div>
      </div>
    </AbsoluteFill>
  )
}

export const harnessRoutingReelMeta = {
  id: "HarnessRoutingReel",
  durationInFrames: 210,
  fps: 30,
  width: 1280,
  height: 720,
} as const
