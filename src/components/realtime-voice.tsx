import {
  AudioWaveform,
  Mic,
  MicOff,
  PhoneOff,
  Radio,
  Volume2,
  X,
} from "lucide-react"
import { useAction, useMutation } from "convex/react"
import { useCallback, useEffect, useRef, useState } from "react"

import { api } from "../../convex/_generated/api"
import {
  RENDER_UI_TOOL_NAME,
  renderUiToolInputSchema,
  serializeGenerativeUi,
} from "../../shared/generative-ui"
import { GenerativeUi } from "@/components/generative-ui"
import { Button } from "@/components/ui/button"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"

type VoiceStatus =
  "connecting" | "error" | "idle" | "listening" | "speaking" | "thinking"

type Transcript = {
  id: string
  role: "assistant" | "user"
  text: string
}

type RealtimeEvent = {
  arguments?: string
  call_id?: string
  delta?: string
  error?: { message?: string }
  item_id?: string
  name?: string
  transcript?: string
  type?: string
}

const statusCopy: Record<VoiceStatus, string> = {
  connecting: "Opening a private audio channel",
  error: "The voice channel stopped",
  idle: "Ready when you are",
  listening: "Listening",
  speaking: "Speaking",
  thinking: "Forming a response",
}

export function RealtimeVoice({
  conversationId,
  onClose,
}: {
  conversationId?: string
  onClose: () => void
}) {
  const createRealtimeSession = useAction(
    api.providerOAuth.createRealtimeSession
  )
  const commitRealtimeTranscript = useMutation(
    api.conversations.commitRealtimeTranscript
  )
  const [status, setStatus] = useState<VoiceStatus>("idle")
  const [voice, setVoice] = useState("marin")
  const [muted, setMuted] = useState(false)
  const [level, setLevel] = useState(0)
  const [error, setError] = useState("")
  const [transcripts, setTranscripts] = useState<Transcript[]>([])
  const [userDraft, setUserDraft] = useState("")
  const [assistantDraft, setAssistantDraft] = useState("")
  const [uiPayload, setUiPayload] = useState("")
  const peerRef = useRef<RTCPeerConnection | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const channelRef = useRef<RTCDataChannel | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const animationRef = useRef<number | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)

  const stop = useCallback(() => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current)
    channelRef.current?.close()
    if (peerRef.current) peerRef.current.onconnectionstatechange = null
    peerRef.current?.close()
    streamRef.current?.getTracks().forEach((track) => track.stop())
    void audioContextRef.current?.close()
    if (audioRef.current) audioRef.current.srcObject = null
    animationRef.current = null
    channelRef.current = null
    peerRef.current = null
    streamRef.current = null
    audioContextRef.current = null
    setLevel(0)
    setMuted(false)
    setStatus("idle")
  }, [])

  useEffect(() => stop, [stop])

  const commitTranscript = useCallback(
    (role: Transcript["role"], text: string, id?: string) => {
      const clean = text.trim()
      if (!clean) return
      setTranscripts((current) => [
        ...current,
        { id: id ?? crypto.randomUUID(), role, text: clean },
      ])
      if (conversationId)
        void commitRealtimeTranscript({
          content: clean,
          conversationId,
          role,
        }).catch(() => undefined)
    },
    [commitRealtimeTranscript, conversationId]
  )

  const sendEvent = useCallback((payload: object) => {
    const channel = channelRef.current
    if (!channel || channel.readyState !== "open") return false
    channel.send(JSON.stringify(payload))
    return true
  }, [])

  const continueAfterToolCall = useCallback(
    (callId: string, output: string) => {
      sendEvent({
        type: "conversation.item.create",
        item: { type: "function_call_output", call_id: callId, output },
      })
      sendEvent({ type: "response.create" })
    },
    [sendEvent]
  )

  const handleEvent = useCallback(
    (event: MessageEvent<string>) => {
      let data: RealtimeEvent
      try {
        data = JSON.parse(event.data) as RealtimeEvent
      } catch {
        return
      }

      switch (data.type) {
        case "input_audio_buffer.speech_started":
          setStatus("listening")
          setUserDraft("")
          break
        case "input_audio_buffer.speech_stopped":
          setStatus("thinking")
          break
        case "conversation.item.input_audio_transcription.delta":
          if (data.delta) setUserDraft((current) => current + data.delta)
          break
        case "conversation.item.input_audio_transcription.completed":
          commitTranscript("user", data.transcript ?? "", data.item_id)
          setUserDraft("")
          break
        case "response.created":
          setStatus("thinking")
          break
        case "response.output_audio_transcript.delta":
          if (data.delta) setAssistantDraft((current) => current + data.delta)
          setStatus("speaking")
          break
        case "response.output_audio_transcript.done":
          commitTranscript("assistant", data.transcript ?? "", data.item_id)
          setAssistantDraft("")
          break
        case "response.function_call_arguments.done": {
          if (
            data.name !== RENDER_UI_TOOL_NAME ||
            !data.arguments ||
            !data.call_id
          )
            break
          let input: unknown
          try {
            input = JSON.parse(data.arguments)
          } catch {
            continueAfterToolCall(
              data.call_id,
              "The interface arguments were invalid."
            )
            break
          }
          const parsed = renderUiToolInputSchema.safeParse(input)
          const payload = parsed.success
            ? serializeGenerativeUi(parsed.data.ui)
            : null
          if (payload) setUiPayload(payload)
          continueAfterToolCall(
            data.call_id,
            payload
              ? "The requested interface is visible to the user."
              : "The requested interface could not be displayed."
          )
          break
        }
        case "response.done":
          setStatus("listening")
          break
        case "error":
          setError(
            data.error?.message ?? "The realtime service reported an error"
          )
          setStatus("error")
          break
      }
    },
    [commitTranscript, continueAfterToolCall]
  )

  const submitUiAction = useCallback(
    (value: string) => {
      const text = value.trim()
      if (!text) return
      if (
        !sendEvent({
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text }],
          },
        })
      )
        return
      sendEvent({ type: "response.create" })
      commitTranscript("user", text)
      setStatus("thinking")
    },
    [commitTranscript, sendEvent]
  )

  const startMeter = useCallback((stream: MediaStream) => {
    const context = new AudioContext()
    const analyser = context.createAnalyser()
    const samples = new Uint8Array(analyser.frequencyBinCount)
    analyser.fftSize = 256
    context.createMediaStreamSource(stream).connect(analyser)
    audioContextRef.current = context

    const measure = () => {
      analyser.getByteFrequencyData(samples)
      const average =
        samples.reduce((sum, value) => sum + value, 0) / samples.length
      setLevel(Math.min(1, average / 72))
      animationRef.current = requestAnimationFrame(measure)
    }
    measure()
  }, [])

  const connect = useCallback(async () => {
    setStatus("connecting")
    setError("")
    setTranscripts([])
    setUiPayload("")

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true,
        },
      })
      const peer = new RTCPeerConnection()
      const channel = peer.createDataChannel("oai-events")
      peerRef.current = peer
      streamRef.current = stream
      channelRef.current = channel
      stream.getTracks().forEach((track) => peer.addTrack(track, stream))
      peer.ontrack = ({ streams }) => {
        if (!audioRef.current) return
        audioRef.current.srcObject = streams[0]
        void audioRef.current.play().catch(() => undefined)
      }
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === "connected") setStatus("listening")
        if (
          ["closed", "disconnected", "failed"].includes(peer.connectionState)
        ) {
          setError("The realtime connection was interrupted")
          setStatus("error")
        }
      }
      channel.addEventListener("message", handleEvent)

      const offer = await peer.createOffer()
      await peer.setLocalDescription(offer)
      if (!offer.sdp)
        throw new Error("The browser did not create an audio offer")
      const session = await createRealtimeSession({
        ...(conversationId ? { conversationId } : {}),
        offer: offer.sdp,
        voice,
      })

      await peer.setRemoteDescription({
        type: "answer",
        sdp: session.answer,
      })
      if (session.memoryReferenceText) {
        const injectMemoryReference = () => {
          if (channel.readyState !== "open") return
          channel.send(
            JSON.stringify({
              type: "conversation.item.create",
              item: {
                type: "message",
                role: "user",
                content: [
                  {
                    type: "input_text",
                    text: `Reference context for this conversation:\n${session.memoryReferenceText}`,
                  },
                ],
              },
            })
          )
        }
        if (channel.readyState === "open") injectMemoryReference()
        else
          channel.addEventListener("open", injectMemoryReference, {
            once: true,
          })
      }
      startMeter(stream)
    } catch (cause) {
      stop()
      setError(
        cause instanceof Error
          ? cause.message
          : "Microphone access or the realtime connection failed"
      )
      setStatus("error")
    }
  }, [
    conversationId,
    createRealtimeSession,
    handleEvent,
    startMeter,
    stop,
    voice,
  ])

  const toggleMute = () => {
    const next = !muted
    streamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !next
    })
    setMuted(next)
  }

  const liveTranscript = assistantDraft || userDraft
  const isLive = !["error", "idle"].includes(status)

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <audio ref={audioRef} autoPlay className="sr-only" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,color-mix(in_oklch,var(--primary)_12%,transparent),transparent_38%)]" />
      <header className="relative flex items-center justify-between border-b px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Radio className="size-4 text-primary" aria-hidden="true" />
          Realtime voice
          <span className="text-xs font-normal text-muted-foreground">
            GPT-Realtime-2.1
          </span>
        </div>
        <Button
          aria-label="Close voice mode"
          onClick={() => {
            stop()
            onClose()
          }}
          size="icon"
          variant="ghost"
        >
          <X aria-hidden="true" />
        </Button>
      </header>

      <div className="relative grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <main className="flex min-h-[28rem] flex-col items-center justify-center px-5 py-10 text-center">
          <p
            aria-live="polite"
            className="text-xs font-semibold tracking-[0.16em] text-primary uppercase"
          >
            {muted ? "Microphone muted" : statusCopy[status]}
          </p>
          <div
            className="my-8 flex h-32 items-center justify-center gap-1.5"
            aria-hidden="true"
          >
            {Array.from({ length: 15 }, (_, index) => {
              const distance = Math.abs(index - 7)
              const height = isLive
                ? 18 + Math.max(0, level * 96 - distance * 7)
                : 18 + Math.max(0, 34 - distance * 5)
              return (
                <span
                  className="w-1.5 rounded-full bg-primary transition-[height,opacity] duration-100"
                  key={index}
                  style={{
                    height,
                    opacity: isLive ? 0.35 + level * 0.65 : 0.2,
                  }}
                />
              )
            })}
          </div>
          <p className="min-h-14 max-w-xl text-lg leading-relaxed text-balance text-foreground sm:text-xl">
            {liveTranscript ||
              (isLive
                ? "Speak naturally. You can interrupt at any time."
                : "Start a low-latency voice conversation with live feedback.")}
          </p>

          {error ? (
            <p className="mt-4 max-w-md text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          <div className="mt-9 flex items-center gap-3">
            {!isLive ? (
              <Button
                className="h-11 rounded-full px-5"
                onClick={() => void connect()}
              >
                <AudioWaveform aria-hidden="true" />
                {status === "error" ? "Try again" : "Start voice"}
              </Button>
            ) : (
              <>
                <Button
                  aria-label={muted ? "Unmute microphone" : "Mute microphone"}
                  className="size-11 rounded-full"
                  onClick={toggleMute}
                  size="icon-lg"
                  variant="secondary"
                >
                  {muted ? (
                    <MicOff aria-hidden="true" />
                  ) : (
                    <Mic aria-hidden="true" />
                  )}
                </Button>
                <Button
                  aria-label="End voice conversation"
                  className="size-11 rounded-full"
                  onClick={stop}
                  size="icon-lg"
                  variant="destructive"
                >
                  <PhoneOff aria-hidden="true" />
                </Button>
              </>
            )}
          </div>

          {!isLive ? (
            <label className="mt-7 flex items-center gap-2 text-xs text-muted-foreground">
              <Volume2 className="size-3.5" aria-hidden="true" />
              Voice
              <NativeSelect
                value={voice}
                onChange={(event) => setVoice(event.target.value)}
              >
                <NativeSelectOption value="marin">Marin</NativeSelectOption>
                <NativeSelectOption value="cedar">Cedar</NativeSelectOption>
                <NativeSelectOption value="alloy">Alloy</NativeSelectOption>
                <NativeSelectOption value="ash">Ash</NativeSelectOption>
                <NativeSelectOption value="ballad">Ballad</NativeSelectOption>
                <NativeSelectOption value="coral">Coral</NativeSelectOption>
                <NativeSelectOption value="echo">Echo</NativeSelectOption>
                <NativeSelectOption value="sage">Sage</NativeSelectOption>
                <NativeSelectOption value="shimmer">Shimmer</NativeSelectOption>
                <NativeSelectOption value="verse">Verse</NativeSelectOption>
              </NativeSelect>
            </label>
          ) : null}
        </main>

        <aside className="min-h-0 overflow-y-auto border-t bg-muted/20 lg:border-t-0 lg:border-l">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <h2 className="text-sm font-medium">Live transcript</h2>
            <span className="text-[11px] text-muted-foreground">
              Session only
            </span>
          </div>
          {uiPayload ? (
            <div className="border-b p-5">
              <p className="mb-3 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                Generated view
              </p>
              <GenerativeUi
                disabled={!isLive}
                onAction={submitUiAction}
                payload={uiPayload}
              />
            </div>
          ) : null}
          <div className="max-h-72 space-y-5 overflow-y-auto px-5 py-5 lg:max-h-[calc(100svh-8rem)]">
            {transcripts.length === 0 ? (
              <p className="text-sm leading-relaxed text-muted-foreground">
                Spoken turns appear here while the channel is open.
              </p>
            ) : (
              transcripts.map((item) => (
                <div key={item.id}>
                  <p className="mb-1 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                    {item.role === "user" ? "You" : "AI"}
                  </p>
                  <p className="text-sm leading-relaxed">{item.text}</p>
                </div>
              ))
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
