export type WelcomeMessage = Readonly<{
  id: string
  title: (name: string | null | undefined) => string
}>

export const WELCOME_DESCRIPTION =
  "Choose a model, then share what you’d like to accomplish. Attach files whenever they add helpful context."

const WELCOME_MESSAGES = [
  {
    id: "good-to-see-you",
    title: (name) => (name ? `Good to see you, ${name}.` : "Good to see you."),
  },
  {
    id: "welcome-in",
    title: (name) => (name ? `Welcome in, ${name}.` : "Welcome in."),
  },
  {
    id: "glad-you-are-here",
    title: (name) =>
      name ? `Glad you’re here, ${name}.` : "Glad you’re here.",
  },
  {
    id: "ready-when-you-are",
    title: (name) =>
      name ? `Ready when you are, ${name}.` : "Ready when you are.",
  },
  {
    id: "good-to-have-you-here",
    title: (name) =>
      name
        ? `It’s good to have you here, ${name}.`
        : "It’s good to have you here.",
  },
  {
    id: "build-something-useful",
    title: (name) =>
      name
        ? `Let’s build something useful, ${name}.`
        : "Let’s build something useful.",
  },
] as const satisfies readonly WelcomeMessage[]

const LAST_WELCOME_MESSAGE_KEY = "dev3:last-welcome-message"
const DEFAULT_WELCOME_MESSAGE = WELCOME_MESSAGES[0]

function normalizeRandomValue(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.min(Math.max(value, 0), 1 - Number.EPSILON)
}

export function selectWelcomeMessage(
  previousMessageId: string | null,
  randomValue = Math.random()
): WelcomeMessage {
  const candidates = WELCOME_MESSAGES.filter(
    (message) => message.id !== previousMessageId
  )
  const index = Math.floor(
    normalizeRandomValue(randomValue) * candidates.length
  )

  return candidates[index] ?? DEFAULT_WELCOME_MESSAGE
}

export function getDefaultWelcomeMessage(): WelcomeMessage {
  return DEFAULT_WELCOME_MESSAGE
}

function createLaunchWelcomeMessage(): WelcomeMessage {
  let previousMessageId: string | null = null
  try {
    previousMessageId = window.localStorage.getItem(LAST_WELCOME_MESSAGE_KEY)
  } catch {
    // Storage can be unavailable in restricted browser contexts; rotation still works for this launch.
  }

  const message = selectWelcomeMessage(previousMessageId)

  try {
    window.localStorage.setItem(LAST_WELCOME_MESSAGE_KEY, message.id)
  } catch {
    // A failed write only means the next launch may repeat the same greeting.
  }

  return message
}

// The client bundle is evaluated once per renderer launch, which keeps the greeting stable while navigating.
const launchWelcomeMessage =
  typeof window === "undefined" ? undefined : createLaunchWelcomeMessage()

export function getLaunchWelcomeMessage(): WelcomeMessage {
  return launchWelcomeMessage ?? DEFAULT_WELCOME_MESSAGE
}
