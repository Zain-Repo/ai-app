import { Show } from "@clerk/tanstack-react-start"
import {
  ActivitySparkIcon,
  AiNetworkIcon,
  AiSecurity01Icon,
  ArrowRight01Icon,
  Moon02Icon,
  Sun03Icon,
  WorkflowSquare01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { createFileRoute, Link, redirect } from "@tanstack/react-router"
import {
  motion,
  useInView,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react"
import { useTheme } from "next-themes"
import { lazy, Suspense, useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"

import { getDesktopApi } from "@/lib/desktop-api"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    if (getDesktopApi()) throw redirect({ href: "/desktop" })
  },
  component: App,
})

const easeOutExpo = [0.16, 1, 0.3, 1] as const

const LandingRoutingPlayer = lazy(async () => {
  const module = await import("@/components/landing/landing-routing-player")
  return { default: module.LandingRoutingPlayer }
})

const chapters = [
  { href: "#top", label: "Open" },
  { href: "#purpose", label: "Purpose" },
  { href: "#path", label: "Path" },
  { href: "#control", label: "Control" },
  { href: "#desktop", label: "Desktop" },
  { href: "#enter", label: "Enter" },
] as const

const beats = [
  {
    icon: AiSecurity01Icon,
    title: "Connect",
    copy: "Bring provider access you control into one identity-aware room.",
    note: "Adapters, not lock-in",
  },
  {
    icon: WorkflowSquare01Icon,
    title: "Compose",
    copy: "Keep the thread, project context, and preferences stable while tools change.",
    note: "Workspace stays fixed",
  },
  {
    icon: AiNetworkIcon,
    title: "Route",
    copy: "Send each run to the model that fits the job without rebuilding the flow.",
    note: "Model is a variable",
  },
  {
    icon: ActivitySparkIcon,
    title: "Inspect",
    copy: "Compare outputs, keep history nearby, and continue from the same place.",
    note: "No lost continuity",
  },
] as const

const controlPoints = [
  {
    title: "One identity across the workspace",
    copy: "Clerk signs you in once. Dev3 carries that session into protected Convex data.",
  },
  {
    title: "Provider connections as adapters",
    copy: "OpenRouter and future providers plug in without forcing the product to become a single-model chat shell.",
  },
  {
    title: "Protected runs and preferences",
    copy: "Conversation state, project context, and response preferences stay server-verified instead of browser folklore.",
  },
] as const

const fadeUp = {
  hidden: { opacity: 0, y: 18, filter: "blur(4px)" },
  show: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.65, ease: easeOutExpo },
  },
}

const stagger = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.07,
      delayChildren: 0.04,
    },
  },
}

function useHydratedReducedMotion() {
  const reduceMotion = useReducedMotion()
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => setHydrated(true), [])

  return hydrated && reduceMotion === true
}

function LandingPlayerPlaceholder() {
  return (
    <div
      aria-hidden="true"
      className="landing-player aspect-video overflow-hidden rounded-[1.5rem] border border-cinema-line/80 bg-cinema-surface"
    />
  )
}

function DeferredLandingRoutingPlayer() {
  const ref = useRef<HTMLDivElement>(null)
  const isNearViewport = useInView(ref, {
    margin: "300px 0px",
    once: true,
  })

  return (
    <div ref={ref}>
      {isNearViewport ? (
        <Suspense fallback={<LandingPlayerPlaceholder />}>
          <LandingRoutingPlayer />
        </Suspense>
      ) : (
        <LandingPlayerPlaceholder />
      )}
    </div>
  )
}

function LandingHeader() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 18)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <motion.header
      initial={false}
      className={cn(
        "landing-header sticky top-0 z-40 border-b border-transparent",
        scrolled && "landing-header--scrolled"
      )}
    >
      <nav
        aria-label="Primary"
        className="cinema-shell flex h-14 items-center justify-between gap-4"
      >
        <a
          href="#top"
          className="group flex shrink-0 items-center gap-2.5 text-sm font-semibold tracking-tight text-cinema-ivory transition-opacity duration-300 hover:opacity-80 focus-visible:ring-2 focus-visible:ring-cinema-accent/70 focus-visible:outline-none"
        >
          <span className="grid size-8 place-items-center overflow-hidden rounded-xl border border-cinema-line bg-cinema-surface/80">
            <img
              src="/icons/icon-192.png"
              alt=""
              width={28}
              height={28}
              className="size-7 object-cover"
            />
          </span>
          <span>Dev3</span>
        </a>

        <div className="hidden items-center gap-1 md:flex">
          {chapters.map((chapter) => (
            <a
              key={chapter.href}
              href={chapter.href}
              className="landing-nav-link px-3 py-2"
            >
              {chapter.label}
            </a>
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <ThemeToggle />
          <Show when="signed-out">
            <a
              className="cinema-cta-ghost hidden h-9 sm:inline-flex"
              href="/sign-in"
            >
              Sign in
            </a>
            <a
              className="cinema-cta inline-flex h-9 items-center justify-center px-4"
              href="/sign-up"
            >
              Create account
            </a>
          </Show>
          <Show when="signed-in">
            <Link
              to="/chat/{-$slug}"
              params={{ slug: undefined }}
              search={{ mode: undefined, projectId: undefined }}
              className="cinema-cta-ghost hidden min-[360px]:inline-flex"
            >
              Open workspace
            </Link>
          </Show>
        </div>
      </nav>
    </motion.header>
  )
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  return (
    <div
      aria-label="Color theme"
      className="landing-theme-toggle flex items-center p-0.5"
      role="group"
    >
      {[
        { icon: Sun03Icon, label: "Light", value: "light" },
        { icon: Moon02Icon, label: "Dark", value: "dark" },
      ].map((option) => {
        const active = mounted && resolvedTheme === option.value
        return (
          <button
            key={option.value}
            type="button"
            aria-label={`${option.label} theme`}
            aria-pressed={active}
            className="landing-theme-option"
            onClick={() => setTheme(option.value)}
          >
            <HugeiconsIcon
              icon={option.icon}
              strokeWidth={1.7}
              className="size-3.5"
              aria-hidden="true"
            />
            <span className="hidden min-[430px]:inline">{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}

function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode
  className?: string
  delay?: number
}) {
  const reduceMotion = useHydratedReducedMotion()

  return (
    <motion.div
      className={className}
      variants={fadeUp}
      initial={reduceMotion ? false : "hidden"}
      whileInView="show"
      viewport={{ once: true, amount: 0.28, margin: "0px 0px -8% 0px" }}
      transition={{ duration: 0.65, ease: easeOutExpo, delay }}
    >
      {children}
    </motion.div>
  )
}

function SplitWord({ text, className }: { text: string; className?: string }) {
  const words = text.split(" ")

  return (
    <span className={cn("inline-flex flex-wrap gap-x-[0.28em]", className)}>
      {words.map((word, index) => (
        <span
          key={`${word}-${index}`}
          className="landing-split-word inline-block"
          style={{ animationDelay: `${120 + index * 55}ms` }}
        >
          {word}
        </span>
      ))}
    </span>
  )
}

function ParallaxMedia({
  src,
  alt,
  className,
  priority = false,
}: {
  src: string
  alt: string
  className?: string
  priority?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const reduceMotion = useHydratedReducedMotion()
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  })
  const y = useTransform(
    scrollYProgress,
    [0, 1],
    reduceMotion ? ["0%", "0%"] : ["-2.5%", "2.5%"]
  )
  const scale = useTransform(
    scrollYProgress,
    [0, 1],
    reduceMotion ? [1, 1] : [1.035, 1]
  )

  return (
    <div
      ref={ref}
      className={cn(
        "relative isolate overflow-hidden rounded-[1.5rem] border border-cinema-line bg-cinema-surface",
        className
      )}
    >
      <motion.img
        src={src}
        alt={alt}
        width={1672}
        height={941}
        fetchPriority={priority ? "high" : undefined}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        style={{ y, scale }}
        className="landing-media-image size-full min-h-full object-cover object-[68%_center] will-change-transform"
      />
      <div className="landing-media-shade pointer-events-none absolute inset-0" />
    </div>
  )
}

function ProgressRail() {
  const { scrollYProgress } = useScroll()
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 28,
    mass: 0.35,
  })
  return (
    <motion.div
      aria-hidden="true"
      className="landing-progress-rail pointer-events-none fixed inset-x-0 top-0 z-50 h-[2px] origin-left bg-cinema-accent"
      style={{ scaleX }}
    />
  )
}

function App() {
  const heroRef = useRef<HTMLElement>(null)
  const reduceMotion = useHydratedReducedMotion()
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  })
  const heroY = useTransform(
    scrollYProgress,
    [0, 1],
    reduceMotion ? [0, 0] : [0, 36]
  )
  const heroOpacity = useTransform(
    scrollYProgress,
    [0, 1],
    reduceMotion ? [1, 1] : [1, 0.55]
  )

  return (
    <main className="app-view cinematic-page landing-motion min-h-[100dvh] overflow-x-clip bg-cinema-bg text-cinema-ivory">
      <ProgressRail />
      <LandingHeader />

      <section
        id="top"
        ref={heroRef}
        aria-labelledby="hero-title"
        className="relative isolate min-h-[calc(100dvh-3.5rem)] overflow-hidden"
      >
        <div className="cinema-shell relative z-10 grid gap-10 pt-10 pb-16 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-end lg:gap-12 lg:pt-16 lg:pb-20">
          <motion.div
            style={{ y: heroY, opacity: heroOpacity }}
            className="min-w-0"
          >
            <motion.a
              initial={false}
              href="#desktop"
              className="group mb-5 inline-flex w-fit items-center gap-2.5 rounded-full border border-cinema-accent/30 bg-cinema-accent/8 py-1.5 pr-3 pl-1.5 text-xs font-semibold tracking-[0.08em] text-cinema-ivory uppercase transition-colors duration-300 hover:border-cinema-accent/55 hover:bg-cinema-accent/12 focus-visible:ring-2 focus-visible:ring-cinema-accent/70 focus-visible:outline-none"
            >
              <span className="rounded-full bg-cinema-accent px-2 py-1 text-[0.65rem] text-cinema-bg">
                New
              </span>
              Desktop version for Windows
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                strokeWidth={2}
                className="size-3.5 transition-transform duration-300 group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </motion.a>

            <motion.p initial={false} className="cinema-eyebrow mb-5">
              Model-agnostic operator room
            </motion.p>

            <h1
              id="hero-title"
              className="cinema-display max-w-[11ch] text-balance"
            >
              <SplitWord text="One room for every model you actually use." />
            </h1>

            <motion.p
              initial={false}
              className="cinema-body mt-6 max-w-[34rem]"
            >
              Dev3 is the control layer between your identity, your provider
              access, and the work itself. Connect adapters, route runs, and
              keep the thread intact when the model changes.
            </motion.p>

            <motion.div
              initial={false}
              className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center"
            >
              <a
                className="cinema-cta group/button inline-flex h-11 items-center justify-center gap-2 px-5 text-sm"
                href="/sign-up"
              >
                Create account
                <HugeiconsIcon
                  icon={ArrowRight01Icon}
                  strokeWidth={2}
                  className="transition-transform duration-300 group-hover/button:translate-x-0.5"
                  aria-hidden="true"
                />
              </a>
              <a href="#path" className="cinema-cta-ghost h-11 px-5">
                Watch the path
              </a>
            </motion.div>

            <motion.dl
              variants={stagger}
              initial={false}
              className="mt-12 grid max-w-xl grid-cols-1 gap-4 sm:grid-cols-3"
            >
              {[
                ["Use", "Provider-owned access"],
                ["Hold", "Thread + preferences"],
                ["Change", "Only the model"],
              ].map(([label, value]) => (
                <motion.div
                  key={label}
                  variants={fadeUp}
                  className="border-t border-cinema-line pt-4"
                >
                  <dt className="cinema-kicker">{label}</dt>
                  <dd className="mt-2 text-sm text-cinema-ivory/90">{value}</dd>
                </motion.div>
              ))}
            </motion.dl>
          </motion.div>

          <div className="relative min-w-0">
            <ParallaxMedia
              src="/media/dev3-hero.webp"
              alt="Optical routing plate with converging signal paths"
              className="aspect-[16/11] shadow-[0_30px_80px_oklch(0_0_0/0.18)]"
              priority
            />
            <Reveal delay={0.12} className="mt-4">
              <div className="grid gap-3 sm:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-[1.25rem] border border-cinema-line bg-cinema-surface/70 p-4 backdrop-blur-sm">
                  <p className="cinema-kicker">What this is</p>
                  <p className="mt-2 text-sm leading-relaxed text-cinema-muted">
                    A focused multi-model workspace: sign in, connect a
                    provider, compose work, and route each run without
                    restarting the room.
                  </p>
                </div>
                <div className="rounded-[1.25rem] border border-cinema-line bg-cinema-surface/70 p-4">
                  <p className="cinema-kicker text-cinema-accent">Not this</p>
                  <p className="mt-2 text-sm leading-relaxed text-cinema-ivory/88">
                    Not another single-model chat skin. The product stays stable
                    while the model underneath remains replaceable.
                  </p>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      <section
        id="purpose"
        aria-labelledby="purpose-title"
        className="relative border-y border-cinema-line/80 bg-cinema-surface/35"
      >
        <div className="cinema-shell grid gap-10 py-20 md:grid-cols-12 md:gap-8 md:py-28">
          <Reveal className="md:col-span-5">
            <p className="cinema-eyebrow">Scene 02 · Purpose</p>
            <h2
              id="purpose-title"
              className="cinema-section-heading mt-4 max-w-[12ch] text-balance"
            >
              The model is temporary. The workflow is the product.
            </h2>
          </Reveal>
          <Reveal delay={0.08} className="md:col-span-6 md:col-start-7">
            <p className="cinema-body max-w-[38rem]">
              Dev3 exists for people who switch models often and refuse to
              rebuild their room every time a better endpoint appears. Identity,
              provider adapters, project context, and conversation history stay
              in one place. The only thing that should feel optional is the
              model name on the run.
            </p>
            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              {[
                [
                  "Stable surface",
                  "Same compose path, same preferences, same history.",
                ],
                [
                  "Swappable core",
                  "Route a task to the model that earns the turn.",
                ],
              ].map(([title, copy]) => (
                <div
                  key={title}
                  className="rounded-[1.25rem] border border-cinema-line bg-cinema-bg/50 p-5"
                >
                  <h3 className="font-heading text-lg font-semibold tracking-tight">
                    {title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-cinema-muted">
                    {copy}
                  </p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      <section
        id="path"
        aria-labelledby="path-title"
        className="relative py-20 md:py-28"
      >
        <div className="cinema-shell">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-end">
            <Reveal>
              <p className="cinema-eyebrow">Scene 03 · Path</p>
              <h2
                id="path-title"
                className="cinema-section-heading mt-4 max-w-[11ch] text-balance"
              >
                A four-beat path through the noise.
              </h2>
              <p className="cinema-body mt-5 max-w-[34rem]">
                The reel below is a Remotion composition of the product loop:
                connect access, compose the work, route the model, inspect the
                result. Scroll stays calm; the path itself moves.
              </p>
            </Reveal>
            <Reveal delay={0.1}>
              <DeferredLandingRoutingPlayer />
            </Reveal>
          </div>

          <motion.ol
            variants={stagger}
            initial={reduceMotion ? false : "hidden"}
            whileInView="show"
            viewport={{ once: true, amount: 0.2 }}
            className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4"
          >
            {beats.map((beat, index) => (
              <motion.li
                key={beat.title}
                variants={fadeUp}
                whileHover={
                  reduceMotion
                    ? undefined
                    : {
                        y: -4,
                        transition: { duration: 0.35, ease: easeOutExpo },
                      }
                }
                className="group relative overflow-hidden rounded-[1.4rem] border border-cinema-line bg-cinema-surface/80 p-5"
              >
                <div className="mb-10 flex items-center justify-between gap-3">
                  <span className="grid size-10 place-items-center rounded-full border border-cinema-line bg-cinema-bg/70 text-cinema-accent">
                    <HugeiconsIcon
                      icon={beat.icon}
                      strokeWidth={1.6}
                      className="size-5"
                      aria-hidden="true"
                    />
                  </span>
                  <span className="cinema-kicker tabular-nums">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </div>
                <h3 className="font-heading text-2xl font-semibold tracking-tight">
                  {beat.title}
                </h3>
                <p className="mt-3 max-w-[28ch] text-sm leading-relaxed text-cinema-muted">
                  {beat.copy}
                </p>
                <p className="mt-8 text-xs tracking-[0.16em] text-cinema-accent/90 uppercase">
                  {beat.note}
                </p>
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px origin-left scale-x-0 bg-cinema-accent transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-x-100" />
              </motion.li>
            ))}
          </motion.ol>
        </div>
      </section>

      <section
        id="control"
        aria-labelledby="control-title"
        className="relative border-y border-cinema-line/80 bg-cinema-surface/35"
      >
        <div className="cinema-shell grid gap-12 py-20 md:grid-cols-12 md:items-center md:py-28">
          <Reveal className="min-w-0 md:col-span-6">
            <ParallaxMedia
              src="/media/dev3-routing-detail.webp"
              alt="Precision optical paths converging through a routing plate"
              className="aspect-[4/3]"
            />
          </Reveal>

          <div className="min-w-0 md:col-span-5 md:col-start-8">
            <Reveal>
              <p className="cinema-eyebrow">Scene 04 · Control</p>
              <h2
                id="control-title"
                className="cinema-section-heading mt-4 max-w-[11ch] text-balance"
              >
                Your access. Your session. Your continuity.
              </h2>
              <p className="cinema-body mt-5 max-w-[36rem]">
                The landing page is not selling a prompt box. It is explaining
                Dev3: a signed-in workspace that keeps provider choice and run
                history under control while models come and go.
              </p>
            </Reveal>

            <div className="mt-10 divide-y divide-cinema-line">
              {controlPoints.map((point, index) => (
                <Reveal key={point.title} delay={index * 0.06}>
                  <article className="grid gap-2 py-5 sm:grid-cols-[auto_1fr] sm:gap-4">
                    <span className="cinema-kicker pt-1 tabular-nums">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <h3 className="text-base font-semibold tracking-tight text-cinema-ivory">
                        {point.title}
                      </h3>
                      <p className="mt-2 max-w-[40ch] text-sm leading-relaxed text-cinema-muted">
                        {point.copy}
                      </p>
                    </div>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section
        id="desktop"
        aria-labelledby="desktop-title"
        className="relative overflow-hidden border-b border-cinema-line/80"
      >
        <div className="landing-accent-field pointer-events-none absolute inset-0" />
        <div className="cinema-shell relative grid gap-12 py-20 md:grid-cols-12 md:items-center md:py-28">
          <Reveal className="md:col-span-6">
            <p className="cinema-eyebrow">Scene 05 · Desktop</p>
            <h2
              id="desktop-title"
              className="cinema-section-heading mt-4 max-w-[12ch] text-balance"
            >
              Meet the new desktop version.
            </h2>
            <p className="cinema-body mt-5 max-w-[37rem]">
              Dev3 is coming to Windows as a dedicated desktop app. Keep the
              same signed-in workspace, use your ChatGPT subscription through
              Codex, and receive updates without rebuilding your setup.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <a
                className="cinema-cta group/button inline-flex h-11 items-center justify-center gap-2 px-5 text-sm"
                href="https://github.com/Zain-Repo/ai-app/releases/latest/download/dev3-setup.exe"
              >
                Download for Windows
                <HugeiconsIcon
                  icon={ArrowRight01Icon}
                  strokeWidth={2}
                  className="transition-transform duration-300 group-hover/button:translate-x-0.5"
                  aria-hidden="true"
                />
              </a>
              <a
                className="cinema-cta-ghost h-11 px-5"
                href="https://github.com/Zain-Repo/ai-app/releases/latest"
                target="_blank"
                rel="noreferrer"
              >
                Release notes
              </a>
            </div>
            <p className="cinema-kicker mt-3 px-1">
              Windows x64 · NSIS installer
            </p>
          </Reveal>

          <Reveal delay={0.08} className="md:col-span-5 md:col-start-8">
            <ol className="divide-y divide-cinema-line border-y border-cinema-line">
              {[
                [
                  "01",
                  "Dedicated app",
                  "A focused native window for the workspace.",
                ],
                [
                  "02",
                  "Codex access",
                  "Bring your existing ChatGPT plan into Dev3.",
                ],
                [
                  "03",
                  "Built-in updates",
                  "Stay current from inside the desktop app.",
                ],
              ].map(([number, title, copy]) => (
                <li
                  key={number}
                  className="grid gap-3 py-5 sm:grid-cols-[2.5rem_1fr] sm:gap-4"
                >
                  <span className="cinema-kicker pt-1 tabular-nums">
                    {number}
                  </span>
                  <div>
                    <h3 className="text-base font-semibold tracking-tight text-cinema-ivory">
                      {title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-cinema-muted">
                      {copy}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </Reveal>
        </div>
      </section>

      <section
        id="enter"
        aria-labelledby="enter-title"
        className="relative overflow-hidden py-20 md:py-28"
      >
        <div className="landing-accent-field landing-accent-field--end pointer-events-none absolute inset-0" />
        <div className="cinema-shell relative grid gap-10 md:grid-cols-12 md:items-end">
          <Reveal className="md:col-span-7">
            <p className="cinema-eyebrow">Final frame</p>
            <h2
              id="enter-title"
              className="cinema-section-heading mt-4 max-w-[13ch] text-balance"
            >
              Stop rebuilding the room around the model.
            </h2>
            <p className="cinema-body mt-5 max-w-[34rem]">
              Create an account, connect the provider you already trust, and
              keep every run inside one operator surface.
            </p>
          </Reveal>

          <Reveal delay={0.08} className="md:col-span-4 md:col-start-9">
            <Show when="signed-out">
              <div className="flex flex-col gap-3">
                <a
                  className="cinema-cta group/button inline-flex h-11 w-full items-center justify-center gap-2 px-5"
                  href="/sign-up"
                >
                  Create account
                  <HugeiconsIcon
                    icon={ArrowRight01Icon}
                    strokeWidth={2}
                    className="transition-transform duration-300 group-hover/button:translate-x-0.5"
                    aria-hidden="true"
                  />
                </a>
                <a className="cinema-cta-ghost h-11 w-full" href="/sign-in">
                  Sign in
                </a>
              </div>
            </Show>
            <Show when="signed-in">
              <Link
                className="cinema-cta inline-flex h-11 w-full items-center justify-center px-5"
                params={{ slug: undefined }}
                search={{ mode: undefined, projectId: undefined }}
                to="/chat/{-$slug}"
              >
                Open workspace
              </Link>
            </Show>
          </Reveal>
        </div>
      </section>

      <footer className="border-t border-cinema-line/70">
        <div className="cinema-shell flex flex-col gap-3 py-8 text-sm text-cinema-muted sm:flex-row sm:items-center sm:justify-between">
          <p className="text-cinema-ivory">Dev3</p>
          <p>Built for model choice without workflow churn.</p>
        </div>
      </footer>
    </main>
  )
}
