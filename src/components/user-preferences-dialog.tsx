import {
  Alert02Icon,
  CheckmarkCircle02Icon,
  Settings02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useMutation, useQuery } from "convex/react"
import { useEffect, useRef, useState } from "react"
import type { FormEvent, ReactElement } from "react"

import { api } from "../../convex/_generated/api"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Spinner } from "@/components/ui/spinner"
import { userMessageBubbleColorOptions } from "@/lib/user-message-bubble-color"
import type { UserMessageBubbleColor } from "@/lib/user-message-bubble-color"

const defaultPreferences = {
  defaultModel: null,
  language: "auto",
  intelligenceLevel: "adaptive",
  responseDetail: "balanced",
  userMessageBubbleColor: "default",
} as const

type Preferences = {
  defaultModel: string | null
  language: "auto" | "en" | "fr" | "es"
  intelligenceLevel: "adaptive" | "quick" | "balanced" | "deep"
  responseDetail: "concise" | "balanced" | "detailed"
  userMessageBubbleColor: UserMessageBubbleColor
}

type UserPreferencesDialogProps = {
  models: Array<{ label: string; value: string }>
  onOpenChange?: (open: boolean) => void
  open?: boolean
  trigger?: ReactElement
}

export function UserPreferencesDialog({
  models,
  onOpenChange,
  open: controlledOpen,
  trigger,
}: UserPreferencesDialogProps) {
  const savedPreferences = useQuery(api.users.getPreferences)
  const updatePreferences = useMutation(api.users.updatePreferences)
  const closeTimer = useRef<number>(undefined)
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const [preferences, setPreferences] =
    useState<Preferences>(defaultPreferences)
  const [status, setStatus] = useState<"error" | "idle" | "saved" | "saving">(
    "idle"
  )
  const isControlled = controlledOpen !== undefined
  const open = controlledOpen ?? uncontrolledOpen

  function setOpen(nextOpen: boolean) {
    if (!isControlled) setUncontrolledOpen(nextOpen)
    onOpenChange?.(nextOpen)
  }

  function close() {
    window.clearTimeout(closeTimer.current)
    setStatus("idle")
    setOpen(false)
  }

  useEffect(() => {
    if (!open || savedPreferences === undefined || status !== "idle") return
    setPreferences(savedPreferences)
    setStatus("idle")
  }, [open, savedPreferences, status])

  useEffect(() => () => window.clearTimeout(closeTimer.current), [])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus("saving")

    try {
      await updatePreferences(preferences)
      setStatus("saved")
      closeTimer.current = window.setTimeout(close, 500)
    } catch {
      setStatus("error")
    }
  }

  const loading = savedPreferences === undefined
  const pending = status === "saving" || status === "saved"

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        window.clearTimeout(closeTimer.current)
        setOpen(nextOpen)
        if (!nextOpen) setStatus("idle")
      }}
    >
      {trigger ? (
        <DialogTrigger render={trigger} />
      ) : !isControlled ? (
        <DialogTrigger
          render={
            <Button size="sm" variant="ghost">
              <HugeiconsIcon
                aria-hidden="true"
                icon={Settings02Icon}
                strokeWidth={1.8}
              />
              Preferences
            </Button>
          }
        />
      ) : null}

      <DialogContent className="max-h-[calc(100svh-2rem)] gap-0 overflow-y-auto p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border/70 px-5 py-4 pr-14 sm:px-6">
          <DialogTitle>User preferences</DialogTitle>
          <DialogDescription>
            Set the defaults used when you start a new conversation.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={save}>
          <div className="divide-y divide-border/70 px-5 sm:px-6">
            <PreferenceField
              description="Used for new conversations. Existing chats keep their current model."
              htmlFor="preference-model"
              label="Default model"
            >
              <NativeSelect
                aria-describedby="preference-model-description"
                className="w-full sm:w-44"
                disabled={loading || pending}
                id="preference-model"
                onChange={(event) =>
                  setPreferences((current) => ({
                    ...current,
                    defaultModel: event.target.value || null,
                  }))
                }
                value={preferences.defaultModel ?? ""}
              >
                <NativeSelectOption value="">
                  First available
                </NativeSelectOption>
                {preferences.defaultModel &&
                !models.some(
                  (model) => model.value === preferences.defaultModel
                ) ? (
                  <NativeSelectOption disabled value={preferences.defaultModel}>
                    {preferences.defaultModel} (unavailable)
                  </NativeSelectOption>
                ) : null}
                {models.map((model) => (
                  <NativeSelectOption key={model.value} value={model.value}>
                    {model.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </PreferenceField>

            <PreferenceField
              description="Use your browser language or choose one explicitly."
              htmlFor="preference-language"
              label="Language"
            >
              <NativeSelect
                aria-describedby="preference-language-description"
                className="w-full sm:w-44"
                disabled={loading || pending}
                id="preference-language"
                onChange={(event) =>
                  setPreferences((current) => ({
                    ...current,
                    language: event.target.value as Preferences["language"],
                  }))
                }
                value={preferences.language}
              >
                <NativeSelectOption value="auto">Automatic</NativeSelectOption>
                <NativeSelectOption value="en">English</NativeSelectOption>
                <NativeSelectOption value="fr">French</NativeSelectOption>
                <NativeSelectOption value="es">Spanish</NativeSelectOption>
              </NativeSelect>
            </PreferenceField>

            <PreferenceField
              description="Choose how much reasoning the model should use by default."
              htmlFor="preference-intelligence"
              label="Default intelligence"
            >
              <NativeSelect
                aria-describedby="preference-intelligence-description"
                className="w-full sm:w-44"
                disabled={loading || pending}
                id="preference-intelligence"
                onChange={(event) =>
                  setPreferences((current) => ({
                    ...current,
                    intelligenceLevel: event.target
                      .value as Preferences["intelligenceLevel"],
                  }))
                }
                value={preferences.intelligenceLevel}
              >
                <NativeSelectOption value="adaptive">
                  Adaptive
                </NativeSelectOption>
                <NativeSelectOption value="quick">Quick</NativeSelectOption>
                <NativeSelectOption value="balanced">
                  Balanced
                </NativeSelectOption>
                <NativeSelectOption value="deep">Deep</NativeSelectOption>
              </NativeSelect>
            </PreferenceField>

            <PreferenceField
              description="Control how much explanation and context responses include."
              htmlFor="preference-detail"
              label="Response detail"
            >
              <NativeSelect
                aria-describedby="preference-detail-description"
                className="w-full sm:w-44"
                disabled={loading || pending}
                id="preference-detail"
                onChange={(event) =>
                  setPreferences((current) => ({
                    ...current,
                    responseDetail: event.target
                      .value as Preferences["responseDetail"],
                  }))
                }
                value={preferences.responseDetail}
              >
                <NativeSelectOption value="concise">Concise</NativeSelectOption>
                <NativeSelectOption value="balanced">
                  Balanced
                </NativeSelectOption>
                <NativeSelectOption value="detailed">
                  Detailed
                </NativeSelectOption>
              </NativeSelect>
            </PreferenceField>

            <fieldset
              aria-describedby="preference-message-color-description"
              className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_11rem] sm:grid-rows-[auto_auto] sm:gap-x-6 sm:gap-y-1"
              disabled={loading || pending}
            >
              <legend className="text-sm font-medium sm:col-start-1 sm:row-start-1">
                Your message color
              </legend>
              <p
                className="text-xs leading-relaxed text-muted-foreground sm:col-start-1 sm:row-start-2"
                id="preference-message-color-description"
              >
                Choose the color used for messages you send.
              </p>
              <div className="grid grid-cols-2 gap-2 sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:grid-cols-1 sm:self-center">
                {userMessageBubbleColorOptions.map((option) => {
                  const selected =
                    preferences.userMessageBubbleColor === option.value
                  return (
                    <label
                      className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-transparent px-2 py-1.5 transition-[background-color,border-color,box-shadow] has-[input:checked]:border-primary/50 has-[input:checked]:bg-primary/5 has-[input:disabled]:cursor-not-allowed has-[input:disabled]:opacity-50 has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-ring/50 has-[input:focus-visible]:ring-offset-2"
                      key={option.value}
                    >
                      <input
                        checked={selected}
                        className="peer sr-only"
                        name="user-message-bubble-color"
                        onChange={() =>
                          setPreferences((current) => ({
                            ...current,
                            userMessageBubbleColor: option.value,
                          }))
                        }
                        type="radio"
                        value={option.value}
                      />
                      <span
                        aria-hidden="true"
                        className={`size-6 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/20 ${option.swatchClassName}`}
                      />
                      <span className="min-w-0 flex-1 text-sm">
                        {option.label}
                      </span>
                      <span
                        aria-hidden="true"
                        className="hidden text-xs font-medium text-primary peer-checked:inline"
                      >
                        Selected
                      </span>
                    </label>
                  )
                })}
              </div>
            </fieldset>
          </div>

          <DialogFooter className="items-stretch border-t border-border/70 bg-muted/20 px-5 py-4 sm:items-center sm:px-6">
            <div className="min-h-5 flex-1 text-xs" aria-live="polite">
              {loading ? (
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <Spinner className="size-3.5" /> Loading preferences
                </span>
              ) : status === "saved" ? (
                <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                  <HugeiconsIcon
                    aria-hidden="true"
                    className="size-4"
                    icon={CheckmarkCircle02Icon}
                    strokeWidth={2}
                  />
                  Preferences saved
                </span>
              ) : status === "error" ? (
                <span
                  className="inline-flex items-center gap-1.5 text-destructive"
                  role="alert"
                >
                  <HugeiconsIcon
                    aria-hidden="true"
                    className="size-4"
                    icon={Alert02Icon}
                    strokeWidth={2}
                  />
                  Could not save. Try again.
                </span>
              ) : null}
            </div>
            <Button
              disabled={pending}
              onClick={close}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={loading || pending} type="submit">
              {status === "saving" ? (
                <>
                  <Spinner /> Saving
                </>
              ) : (
                "Save preferences"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function PreferenceField({
  children,
  description,
  htmlFor,
  label,
}: {
  children: ReactElement
  description: string
  htmlFor: string
  label: string
}) {
  return (
    <div className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_11rem] sm:items-center sm:gap-6">
      <div>
        <label className="text-sm font-medium" htmlFor={htmlFor}>
          {label}
        </label>
        <p
          className="mt-1 text-xs leading-relaxed text-muted-foreground"
          id={`${htmlFor}-description`}
        >
          {description}
        </p>
      </div>
      {children}
    </div>
  )
}
