import { auth } from "@clerk/tanstack-react-start/server"
import {
  Add01Icon,
  AiBrain01Icon,
  ArrowLeft01Icon,
  Archive02Icon,
  Cancel01Icon,
  Delete02Icon,
  Edit02Icon,
  FileAttachmentIcon,
  FolderAddIcon,
  Link01Icon,
  MoreHorizontalIcon,
  Search01Icon,
  Upload04Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import {
  Camera,
  FileText,
  Folder,
  FolderPlus,
  LibraryBig,
  Paperclip,
  Plug,
} from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type { ReactNode } from "react"
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
  useAction,
  useMutation,
  useQuery,
} from "convex/react"

import { api } from "../../convex/_generated/api"
import type { Doc, Id } from "../../convex/_generated/dataModel"
import { ArchivedChatsDialog } from "@/components/archived-chats-dialog"
import {
  Context,
  ContextContent,
  ContextContentHeader,
  ContextTrigger,
} from "@/components/ai-elements/context"
import { Dev3Mark } from "@/components/dev3-logo"
import { openDesktopUpdaterDialog } from "@/components/desktop-updater"
import { ImageGeneration } from "@/components/ui/image-generation"
import { PersonalizationCenter } from "@/components/personalization-center"
import { ProviderConnectDialog } from "@/components/provider-connect-dialog"
import { ProjectContextProgress } from "@/components/project-context-progress"
import {
  getEmbeddingConnections,
  ProjectSourcesPanel,
} from "@/components/project-sources-panel"
import type {
  ProjectEmbeddingConnection,
  ProjectEmbeddingProfile,
  ProjectSourceItem,
} from "@/components/project-sources-panel"
import { SidebarUserMenu } from "@/components/sidebar-user-menu"
import { SidebarModeControls } from "@/components/sidebar-mode-controls"
import { TextShimmer } from "@/components/text-shimmer"
import { getDesktopApi } from "@/lib/desktop-api"
import { generateDesktopChatTitle } from "@/lib/desktop-chat-title"
import { UploadThingDropzone } from "@/components/uploadthing-dropzone"
import { getUserMessageBubbleColorClassName } from "@/lib/user-message-bubble-color"
import type { UserMessageBubbleColor } from "@/lib/user-message-bubble-color"
import type {
  AIInputMenuItem,
  AIInputOption,
  PromptSettingGroup,
} from "@/components/ui/ai-input"
import { AIInput } from "@/components/ui/ai-input"
import {
  Attachment,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentTrigger,
} from "@/components/ui/attachment"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Message, MessageContent, MessageGroup } from "@/components/ui/message"
import {
  ReasoningStep,
  ReasoningSteps,
  ReasoningStepsContent,
  ReasoningStepsTrigger,
} from "@/components/ui/reasoning-steps"
import {
  MessageScroller,
  MessageScrollerContent,
  MessageScrollerButton,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller"
import { Spinner } from "@/components/ui/spinner"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarInput,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"

const MessageResponse = lazy(async () => {
  const module = await import("@/components/ai-elements/message")
  return { default: module.MessageResponse }
})

const Terminal = lazy(async () => {
  const module = await import("@/components/ai-elements/terminal")
  return { default: module.Terminal }
})

const GenerativeUi = lazy(async () => {
  const module = await import("@/components/generative-ui")
  return { default: module.GenerativeUi }
})

const RealtimeVoice = lazy(async () => {
  const module = await import("@/components/realtime-voice")
  return { default: module.RealtimeVoice }
})

const LibraryWorkspace = lazy(async () => {
  const module = await import("@/components/library-workspace")
  return { default: module.LibraryWorkspace }
})

const requireAuth = createServerFn().handler(async () => {
  if (!(await auth()).isAuthenticated) throw redirect({ href: "/sign-in" })
})

const providerSelectorOptions = [
  {
    label: "ChatGPT subscription",
    provider: "codex",
    requiresDesktop: true,
  },
  {
    label: "Cursor Agent",
    provider: "cursor",
    requiresDesktop: true,
  },
  { label: "OpenAI", provider: "openai", requiresDesktop: false },
  { label: "OpenRouter", provider: "openrouter", requiresDesktop: false },
  { label: "fal", provider: "fal", requiresDesktop: false },
] as const

type ProviderSelectorOption = (typeof providerSelectorOptions)[number]
type ActiveProvider = ProviderSelectorOption["provider"]

const providerFallbackOrder: readonly ActiveProvider[] = [
  "codex",
  "openai",
  "openrouter",
  "fal",
  "cursor",
]

type ProviderConnectionOption = {
  provider: string
  status: string
}

export function getConnectedProviderOptions(
  connections: readonly ProviderConnectionOption[] | undefined,
  desktopAvailable: boolean
) {
  return providerSelectorOptions.filter(
    (option) =>
      (!option.requiresDesktop || desktopAvailable) &&
      connections?.some(
        (connection) =>
          connection.provider === option.provider &&
          connection.status === "connected"
      )
  )
}

export function getExecutionProviderOptions(
  options: readonly ProviderSelectorOption[],
  outputMode: "image" | "text"
): AIInputOption[] {
  return options
    .filter((option) =>
      outputMode === "image"
        ? option.provider === "openrouter" || option.provider === "fal"
        : option.provider !== "fal"
    )
    .map(({ label, provider }) => ({ label, value: provider }))
}

export function isActiveProvider(value: string): value is ActiveProvider {
  return providerSelectorOptions.some((option) => option.provider === value)
}

export function getPreferredProvider(
  options: readonly ProviderSelectorOption[],
  outputMode: "image" | "text" = "text"
) {
  const available = new Set(
    getExecutionProviderOptions(options, outputMode).map(({ value }) => value)
  )
  return providerFallbackOrder.find((provider) => available.has(provider))
}

export function getCurrentCatalogModels<T>(
  catalog: {
    connectionId: string
    models: T[]
    provider: ActiveProvider
  } | null,
  activeProvider: ActiveProvider,
  activeConnectionId: string | undefined
): T[] {
  return catalog?.provider === activeProvider &&
    catalog.connectionId === activeConnectionId
    ? catalog.models
    : []
}

const IMAGE_MODEL_PRIORITY = [
  "fal-ai/flux-2/klein/4b",
  "fal-ai/flux-2-pro",
  "fal-ai/nano-banana-2",
  "fal-ai/recraft/v3/text-to-image",
  "bytedance/seedream/v5/pro/text-to-image",
  "black-forest-labs/flux.2-klein-4b",
  "sourceful/riverflow-v2.5-pro",
]
const imageModelDescriptions: Record<string, string> = {
  "black-forest-labs/flux.2-klein-4b": "Low cost · about $0.014 per 1K image",
  "sourceful/riverflow-v2.5-pro":
    "Best quality · Design Arena rank #1 · about $0.128 per 1K image",
}

export function toggleExpandedProject(
  expandedProjectId: string | undefined,
  projectId: string
) {
  return expandedProjectId === projectId ? undefined : projectId
}

export function resolveActiveProjectId(
  conversationId: string | undefined,
  conversationProjectId: string | undefined,
  projectMode: boolean,
  searchProjectId: string | undefined
) {
  return projectMode || !conversationId
    ? searchProjectId
    : conversationProjectId
}

export function ProjectConversationDisclosure({
  children,
  open,
}: {
  children: ReactNode
  open: boolean
}) {
  const reduceMotion = useReducedMotion() === true

  return (
    <motion.div
      animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
      aria-hidden={!open}
      className="overflow-hidden"
      initial={false}
      inert={!open}
      transition={
        reduceMotion
          ? { duration: 0 }
          : { duration: 0.2, ease: [0.16, 1, 0.3, 1] }
      }
    >
      {children}
    </motion.div>
  )
}

const SIDEBAR_CONVERSATION_LIMIT = 10

export function CappedConversationList({
  conversations,
  renderConversation,
}: {
  conversations: Doc<"conversations">[]
  renderConversation: (conversation: Doc<"conversations">) => ReactNode
}) {
  const [expanded, setExpanded] = useState(false)
  const visibleConversations = expanded
    ? conversations
    : conversations.slice(0, SIDEBAR_CONVERSATION_LIMIT)

  return (
    <>
      {visibleConversations.map(renderConversation)}
      {!expanded && conversations.length > SIDEBAR_CONVERSATION_LIMIT ? (
        <SidebarMenuItem>
          <SidebarMenuButton
            className="justify-center rounded-xl text-xs font-medium text-sidebar-foreground/60 hover:text-sidebar-foreground"
            render={<button onClick={() => setExpanded(true)} type="button" />}
          >
            Show more
          </SidebarMenuButton>
        </SidebarMenuItem>
      ) : null}
    </>
  )
}

type CatalogModel = {
  provider: string
  value: string
  label: string
  description?: string
  contextLength?: number
  outputMode: "image" | "text"
  reasoningEfforts?: ReasoningEffort[]
  defaultReasoningEffort?: ReasoningEffort
}

type LoadedCatalog = {
  connectionId: string
  models: CatalogModel[]
  provider: ActiveProvider
}

type ModelEndpoint = {
  providerName: string
  providerTag: string
  promptPrice: number
  completionPrice: number
  imagePrice?: number
  cacheReadPrice?: number
  cacheWritePrice?: number
  contextLength?: number
  quantization?: string
  uptime?: number
  throughput?: number
}

function formatPrice(value: number) {
  return `$${value.toLocaleString(undefined, {
    maximumFractionDigits: value < 0.01 ? 4 : 3,
  })}`
}

function formatEndpointDescription(endpoint: ModelEndpoint) {
  const details =
    endpoint.imagePrice !== undefined
      ? [`~${formatPrice(endpoint.imagePrice)} / 1K image`]
      : [
          `${formatPrice(endpoint.promptPrice)} input`,
          `${formatPrice(endpoint.completionPrice)} output / 1M`,
        ]
  if (endpoint.cacheReadPrice !== undefined)
    details.push(`${formatPrice(endpoint.cacheReadPrice)} cache read`)
  if (endpoint.cacheWritePrice !== undefined)
    details.push(`${formatPrice(endpoint.cacheWritePrice)} cache write`)
  if (endpoint.quantization && endpoint.quantization !== "unknown")
    details.push(endpoint.quantization.toUpperCase())
  if (endpoint.contextLength)
    details.push(
      `${Math.round(endpoint.contextLength / 1_000).toLocaleString()}K context`
    )
  if (endpoint.throughput !== undefined)
    details.push(`${Math.round(endpoint.throughput)} tok/s`)
  if (endpoint.uptime !== undefined)
    details.push(`${endpoint.uptime.toFixed(2)}% uptime`)
  return details.join(" | ")
}

type ChatAttachment = {
  contentType: string
  name: string
  size: number
  storageId: Id<"_storage">
  url: string
}

type ChatMessage = Omit<Doc<"messages">, "attachments"> & {
  attachments: ChatAttachment[]
}

function readStorageId(value: unknown) {
  if (
    typeof value !== "object" ||
    value === null ||
    !("storageId" in value) ||
    typeof value.storageId !== "string"
  )
    throw new Error("File upload failed")
  return value.storageId as Id<"_storage">
}

function formatFileSize(size: number) {
  return size < 1024 * 1024
    ? `${Math.max(1, Math.round(size / 1024))} KB`
    : `${(size / (1024 * 1024)).toFixed(1)} MB`
}

type ReasoningEffort =
  "ultra" | "max" | "xhigh" | "high" | "medium" | "low" | "minimal" | "none"

type ProjectSetupTab = "instructions" | "sources"

function isProjectSetupTab(value: string): value is ProjectSetupTab {
  return value === "instructions" || value === "sources"
}

function isReasoningEffort(value: string): value is ReasoningEffort {
  return value in reasoningEffortLabels
}

const MAX_PROJECT_SOURCES = 8
const MAX_PROJECT_SOURCE_FILES = 5
const MAX_PROJECT_SOURCE_BYTES = 20 * 1024 * 1024

const reasoningEffortLabels: Record<ReasoningEffort, string> = {
  ultra: "Ultra",
  max: "Max",
  xhigh: "Extra high",
  high: "High",
  medium: "Medium",
  low: "Low",
  minimal: "Minimal",
  none: "Off",
}

const preferenceReasoningEfforts = {
  quick: "low",
  balanced: "medium",
  deep: "high",
} as const

export const Route = createFileRoute("/chat/{-$slug}")({
  beforeLoad: async () => await requireAuth(),
  errorComponent: ChatErrorState,
  validateSearch: (search: Record<string, unknown>) => ({
    mode:
      search.mode === "chat-new" ||
      search.mode === "library" ||
      search.mode === "project" ||
      search.mode === "project-new"
        ? search.mode
        : undefined,
    projectId:
      typeof search.projectId === "string" ? search.projectId : undefined,
    ...(typeof search.messageId === "string"
      ? { messageId: search.messageId }
      : {}),
  }),
  component: ChatPage,
})

function ChatErrorState() {
  const navigate = useNavigate()

  const handleBack = () => {
    if (window.history.length > 1) {
      window.history.back()
      return
    }

    void navigate({
      to: "/chat/{-$slug}",
      params: { slug: undefined },
      search: {
        mode: undefined,
        projectId: undefined,
        messageId: undefined,
      },
    })
  }

  return (
    <main className="app-view grid min-h-svh place-items-center bg-background p-6 text-foreground">
      <div className="app-callback-surface w-full max-w-sm border-y border-border py-8 text-center">
        <p className="font-heading text-xs font-semibold tracking-[0.18em] text-primary uppercase">
          Chat unavailable
        </p>
        <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
          We could not display this chat. Please try again.
        </p>
        <Button className="mt-5" variant="outline" onClick={handleBack}>
          <HugeiconsIcon
            icon={ArrowLeft01Icon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          Back
        </Button>
      </div>
    </main>
  )
}

export class OptionalChatFeatureBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    return this.state.failed
      ? (this.props.fallback ?? null)
      : this.props.children
  }
}

function ChatPage() {
  return (
    <div className="app-view min-h-svh bg-background text-foreground">
      <AuthLoading>
        <ChatStatus loading message="Preparing your workspace..." />
      </AuthLoading>
      <Unauthenticated>
        <ChatStatus message="We could not verify your session. Please sign in again." />
      </Unauthenticated>
      <Authenticated>
        <Workspace />
      </Authenticated>
    </div>
  )
}

function Workspace() {
  const syncCurrent = useMutation(api.users.syncCurrent)
  const [state, setState] = useState<"ready" | "failed" | "syncing">("syncing")

  useEffect(() => {
    void syncCurrent().then(
      () => setState("ready"),
      () => setState("failed")
    )
  }, [syncCurrent])

  if (state !== "ready")
    return (
      <ChatStatus
        loading={state === "syncing"}
        message={
          state === "failed"
            ? "We could not prepare your workspace. Please sign in again."
            : "Preparing your workspace..."
        }
      />
    )
  return <ChatWorkspace />
}

function ChatWorkspace() {
  const navigate = useNavigate()
  const { slug: conversationId } = Route.useParams()
  const search = Route.useSearch()
  const [expandedProjectId, setExpandedProjectId] = useState(search.projectId)
  const viewer = useQuery(api.auth.viewer)
  const preferences = useQuery(api.users.getPreferences)
  const projects = useQuery(api.projects.list)
  const projectConversations = useQuery(
    api.conversations.listRecent,
    search.projectId
      ? {
          limit: 30,
          projectId: search.projectId,
        }
      : "skip"
  )
  const projectSources = useQuery(
    api.projects.listSources,
    search.mode === "project" && search.projectId
      ? { projectId: search.projectId }
      : "skip"
  )
  const projectEmbeddingProfile = useQuery(
    api.projects.getEmbeddingProfile,
    search.mode === "project" && search.projectId
      ? { projectId: search.projectId }
      : "skip"
  )
  const recentConversations = useQuery(api.conversations.listRecent, {
    limit: 30,
    unassignedOnly: true,
  })
  const selected = useQuery(
    api.conversations.get,
    conversationId ? { conversationId } : "skip"
  )
  const activeProjectId = resolveActiveProjectId(
    conversationId,
    selected?.projectId,
    search.mode === "project",
    search.projectId
  )
  const selectedProject = useQuery(
    api.projects.get,
    activeProjectId ? { projectId: activeProjectId } : "skip"
  )
  const messages = useQuery(
    api.conversations.listMessages,
    conversationId ? { conversationId } : "skip"
  )
  const startConversation = useMutation(api.conversations.start)
  const startRealtimeConversation = useMutation(api.conversations.startRealtime)
  const sendMessage = useMutation(api.conversations.send)
  const setMemoryMode = useMutation(api.conversations.setMemoryMode)
  const finishDesktopCodexResponse = useMutation(
    api.conversations.finishDesktopCodexResponse
  )
  const setDesktopCodexGeneratedTitle = useMutation(
    api.conversations.setDesktopCodexGeneratedTitle
  )
  const archiveConversation = useMutation(api.conversations.archive)
  const removeConversation = useMutation(api.conversations.remove)
  const createProject = useMutation(api.projects.create)
  const addProjectSources = useMutation(api.projects.addSources)
  const configureProjectEmbeddings = useMutation(
    api.projects.configureEmbedding
  )
  const retryProjectSourceIndexing = useMutation(
    api.projects.retrySourceEmbedding
  )
  const removeProjectSource = useMutation(api.projects.removeSource)
  const renameProjectMutation = useMutation(api.projects.rename)
  const removeProject = useMutation(api.projects.remove)
  const moveToProject = useMutation(api.conversations.moveToProject)
  const generateUploadUrl = useMutation(api.attachments.generateUploadUrl)
  const registerAttachment = useMutation(api.attachments.register)
  const discardAttachment = useMutation(api.attachments.discard)
  const connections = useQuery(api.providerConnections.listMine)
  const listModels = useAction(api.providerOAuth.listModels)
  const listModelEndpoints = useAction(api.providerOAuth.listModelEndpoints)
  const getDesktopCodexProjectContext = useAction(
    api.openRouterResponses.getDesktopCodexProjectContext
  )
  const getDesktopCodexMemoryContext = useAction(
    api.openRouterResponses.getDesktopCodexMemoryContext
  )
  const [projectName, setProjectName] = useState("")
  const [projectInstructions, setProjectInstructions] = useState("")
  const [projectSetupTab, setProjectSetupTab] =
    useState<ProjectSetupTab>("instructions")
  const [projectMemoryScope, setProjectMemoryScope] = useState<
    "all_chats" | "project_only"
  >("project_only")
  const [projectSourceFiles, setProjectSourceFiles] = useState<File[]>([])
  const [projectSourceLinks, setProjectSourceLinks] = useState<string[]>([])
  const [projectSourceUrl, setProjectSourceUrl] = useState("")
  const [projectSourceError, setProjectSourceError] = useState("")
  const [projectEmbeddingConnectionId, setProjectEmbeddingConnectionId] =
    useState<Id<"providerConnections"> | "">("")
  const [projectEmbeddingActionError, setProjectEmbeddingActionError] =
    useState("")
  const [projectEmbeddingActionPending, setProjectEmbeddingActionPending] =
    useState(false)
  const [projectState, setProjectState] = useState<
    "creating" | "failed" | "idle"
  >("idle")
  const [searchQuery, setSearchQuery] = useState("")
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [archivedOpen, setArchivedOpen] = useState(false)
  const [connectorOpen, setConnectorOpen] = useState(false)
  const [projectActionFailed, setProjectActionFailed] = useState(false)
  const [projectMenuError, setProjectMenuError] = useState("")
  const [projectMenuActionId, setProjectMenuActionId] = useState<string | null>(
    null
  )
  const [conversationActionId, setConversationActionId] = useState<
    string | null
  >(null)
  const [catalog, setCatalog] = useState<LoadedCatalog | null>(null)
  const [catalogState, setCatalogState] = useState<
    "failed" | "idle" | "loading" | "ready"
  >("idle")
  const [modelEndpoints, setModelEndpoints] = useState<ModelEndpoint[]>([])
  const [endpointState, setEndpointState] = useState<
    "failed" | "idle" | "loading" | "ready"
  >("idle")
  const [activeProvider, setActiveProvider] =
    useState<ActiveProvider>("openrouter")
  const [desktopAvailable, setDesktopAvailable] = useState(false)
  const [outputMode, setOutputMode] = useState<"image" | "text">("text")
  const [selectedModelId, setSelectedModelId] = useState("")
  const [sendState, setSendState] = useState<"failed" | "idle" | "sending">(
    "idle"
  )
  const [voiceMode, setVoiceMode] = useState(false)
  const [voiceConversationId, setVoiceConversationId] = useState<string | null>(
    null
  )

  useEffect(() => {
    setExpandedProjectId(search.projectId)
  }, [search.projectId])

  useEffect(() => {
    setDesktopAvailable(Boolean(getDesktopApi()))
  }, [])

  const connectedProviderOptions = useMemo(
    () => getConnectedProviderOptions(connections, desktopAvailable),
    [connections, desktopAvailable]
  )
  const embeddingConnections = useMemo(
    () => getEmbeddingConnections(connections),
    [connections]
  )
  useEffect(() => {
    if (
      projectEmbeddingConnectionId &&
      !embeddingConnections.some(
        (connection) => connection.connectionId === projectEmbeddingConnectionId
      )
    )
      setProjectEmbeddingConnectionId("")
  }, [embeddingConnections, projectEmbeddingConnectionId])
  const executionProviderOptions = useMemo(
    () => getExecutionProviderOptions(connectedProviderOptions, outputMode),
    [connectedProviderOptions, outputMode]
  )
  const hasImageProvider = useMemo(
    () =>
      getExecutionProviderOptions(connectedProviderOptions, "image").length > 0,
    [connectedProviderOptions]
  )
  const activeConnection = connections?.find(
    (connection) =>
      connection.provider === activeProvider &&
      connection.status === "connected" &&
      connectedProviderOptions.some(
        (option) => option.provider === connection.provider
      )
  )
  const activeConnectionId = activeConnection?.connectionId

  useEffect(() => {
    const selectedProvider = connections?.find(
      (connection) => connection.connectionId === selected?.providerConnectionId
    )?.provider
    const provider = connectedProviderOptions.find(
      (option) => option.provider === selectedProvider
    )?.provider

    if (provider) {
      setActiveProvider(provider)
      return
    }

    const preferredProvider = getPreferredProvider(
      connectedProviderOptions,
      outputMode
    )
    if (preferredProvider) setActiveProvider(preferredProvider)
  }, [
    connections,
    connectedProviderOptions,
    outputMode,
    selected?.providerConnectionId,
  ])

  useEffect(() => {
    if (conversationId && selected) setOutputMode(selected.outputMode ?? "text")
  }, [conversationId, selected])

  useEffect(() => {
    if (executionProviderOptions.some(({ value }) => value === activeProvider))
      return
    const preferredProvider = getPreferredProvider(
      connectedProviderOptions,
      outputMode
    )
    if (preferredProvider) setActiveProvider(preferredProvider)
  }, [
    activeProvider,
    connectedProviderOptions,
    executionProviderOptions,
    outputMode,
  ])

  useEffect(() => {
    if (!activeConnectionId) {
      setCatalog(null)
      setCatalogState("idle")
      return
    }

    let cancelled = false
    setCatalogState("loading")
    const modelsPromise =
      activeProvider === "codex"
        ? getDesktopApi()
            ?.codex.listModels()
            .then((models) =>
              models.map((model): CatalogModel => ({
                provider: "openai",
                value: model.value,
                label: model.label,
                outputMode: "text",
                ...(model.description
                  ? { description: model.description }
                  : {}),
                ...(model.reasoningEfforts
                  ? {
                      reasoningEfforts:
                        model.reasoningEfforts.filter(isReasoningEffort),
                    }
                  : {}),
                ...(model.defaultReasoningEffort &&
                isReasoningEffort(model.defaultReasoningEffort)
                  ? {
                      defaultReasoningEffort: model.defaultReasoningEffort,
                    }
                  : {}),
              }))
            )
        : activeProvider === "cursor"
          ? Promise.resolve([])
          : listModels({ provider: activeProvider })
    void (
      modelsPromise ?? Promise.reject(new Error("Desktop unavailable"))
    ).then(
      (models) => {
        if (cancelled) return
        setCatalog({
          connectionId: activeConnectionId,
          models,
          provider: activeProvider,
        })
        setCatalogState("ready")
      },
      () => {
        if (cancelled) return
        setCatalog(null)
        setCatalogState("failed")
      }
    )

    return () => {
      cancelled = true
    }
  }, [activeConnectionId, activeProvider, listModels])

  const currentCatalog = useMemo(
    () => getCurrentCatalogModels(catalog, activeProvider, activeConnectionId),
    [activeConnectionId, activeProvider, catalog]
  )
  const availableModels = useMemo(
    () => currentCatalog.filter((model) => model.outputMode === outputMode),
    [currentCatalog, outputMode]
  )
  const providerModels = useMemo(
    () =>
      [...availableModels].sort((left, right) => {
        const leftPriority = IMAGE_MODEL_PRIORITY.indexOf(left.value)
        const rightPriority = IMAGE_MODEL_PRIORITY.indexOf(right.value)
        if (leftPriority === -1 && rightPriority === -1) return 0
        if (leftPriority === -1) return 1
        if (rightPriority === -1) return -1
        return leftPriority - rightPriority
      }),
    [availableModels]
  )
  useEffect(() => {
    const preferredModel = selected?.model ?? preferences?.defaultModel
    setSelectedModelId(
      providerModels.find((model) => model.value === preferredModel)?.value ??
        providerModels.at(0)?.value ??
        ""
    )
  }, [preferences?.defaultModel, providerModels, selected?.model])

  const selectedModel = providerModels.find(
    (model) => model.value === selectedModelId
  )
  const contextMessage = messages?.findLast(
    (message) =>
      message.role === "assistant" &&
      message.status === "complete" &&
      message.contextTokens !== undefined
  )
  const contextModel = providerModels.find(
    (model) => model.value === contextMessage?.model
  )
  useEffect(() => {
    if (
      activeProvider !== "openrouter" ||
      !activeConnectionId ||
      !selectedModel
    ) {
      setModelEndpoints([])
      setEndpointState("idle")
      return
    }

    let cancelled = false
    setModelEndpoints([])
    setEndpointState("loading")
    void listModelEndpoints({ model: selectedModel.value }).then(
      (endpoints) => {
        if (cancelled) return
        setModelEndpoints(endpoints)
        setEndpointState("ready")
      },
      () => {
        if (cancelled) return
        setModelEndpoints([])
        setEndpointState("failed")
      }
    )
    return () => {
      cancelled = true
    }
  }, [activeConnectionId, activeProvider, listModelEndpoints, selectedModel])

  const settingGroups = useMemo<PromptSettingGroup[]>(() => {
    if (providerModels.length === 0) return []

    const groups: PromptSettingGroup[] = [
      {
        id: "model",
        label: "Model",
        display: "featured",
        moreMenuLabel: "More models",
        options: providerModels.map(({ value, label, description }) => ({
          value,
          label,
          ...(imageModelDescriptions[value] || description
            ? { description: imageModelDescriptions[value] ?? description }
            : {}),
        })),
      },
    ]

    if (activeProvider === "openrouter") {
      const cheapestImage = Math.min(
        ...modelEndpoints.flatMap((endpoint) =>
          endpoint.imagePrice === undefined ? [] : [endpoint.imagePrice]
        )
      )
      const cheapestPrompt = Math.min(
        ...modelEndpoints.map((endpoint) => endpoint.promptPrice)
      )
      const cheapestCompletion = Math.min(
        ...modelEndpoints.map((endpoint) => endpoint.completionPrice)
      )
      groups.push({
        id: "routingProvider",
        label: "Provider",
        display: "submenu",
        options: [
          {
            value: "auto",
            label: "Cheapest available",
            description:
              endpointState === "loading"
                ? "Loading live provider prices..."
                : endpointState === "failed"
                  ? "Live prices unavailable. OpenRouter will still route by price."
                  : "Routes by lowest price and falls back if that host is unavailable.",
          },
          ...modelEndpoints.map((endpoint) => {
            if (endpoint.imagePrice !== undefined) {
              return {
                value: endpoint.providerTag,
                label: `${endpoint.providerName}${
                  endpoint.imagePrice === cheapestImage ? " (lowest price)" : ""
                }`,
                description: formatEndpointDescription(endpoint),
              }
            }
            const cheapestInput = endpoint.promptPrice === cheapestPrompt
            const cheapestOutput =
              endpoint.completionPrice === cheapestCompletion
            const priceLabel =
              cheapestInput && cheapestOutput
                ? " (lowest price)"
                : cheapestInput
                  ? " (lowest input)"
                  : cheapestOutput
                    ? " (lowest output)"
                    : ""
            return {
              value: endpoint.providerTag,
              label: `${endpoint.providerName}${priceLabel}`,
              description: formatEndpointDescription(endpoint),
            }
          }),
        ],
      })
    }

    if (outputMode === "text" && selectedModel?.reasoningEfforts?.length) {
      groups.push({
        id: "effort",
        label: "Reasoning effort",
        display: "submenu",
        options: selectedModel.reasoningEfforts.map((effort) => ({
          value: effort,
          label: reasoningEffortLabels[effort],
        })),
      })
    }

    return groups
  }, [
    activeProvider,
    endpointState,
    modelEndpoints,
    outputMode,
    providerModels,
    selectedModel,
  ])
  const defaultSettings = useMemo(() => {
    const savedEffort = selectedModel?.reasoningEfforts?.find(
      (effort) =>
        selected?.model === selectedModelId &&
        effort === selected.reasoningEffort
    )
    const preferredEffort =
      !preferences || preferences.intelligenceLevel === "adaptive"
        ? undefined
        : preferenceReasoningEfforts[preferences.intelligenceLevel]
    const effort =
      savedEffort ??
      selectedModel?.reasoningEfforts?.find(
        (candidate) => candidate === preferredEffort
      ) ??
      selectedModel?.defaultReasoningEffort
    return {
      model: selectedModelId,
      ...(activeProvider === "openrouter"
        ? { routingProvider: selected?.routingProvider ?? "auto" }
        : {}),
      ...(effort ? { effort } : {}),
    }
  }, [
    activeProvider,
    preferences?.intelligenceLevel,
    selected,
    selectedModel,
    selectedModelId,
  ])

  const normalizedSearch = searchQuery.trim().toLowerCase()
  const filteredProjectConversations = projectConversations?.filter(
    (conversation) =>
      conversation.title.toLowerCase().includes(normalizedSearch)
  )
  const filteredRecentConversations = recentConversations?.filter(
    (conversation) =>
      conversation.title.toLowerCase().includes(normalizedSearch)
  )
  const open = (next: {
    mode?: "chat-new" | "library" | "project" | "project-new"
    messageId?: string
    projectId?: string
    slug?: string
  }) =>
    navigate({
      to: "/chat/{-$slug}",
      params: { slug: next.slug },
      search: {
        mode: next.mode,
        projectId: next.projectId,
        messageId: next.messageId,
      },
    })

  const activateVoice = async () => {
    if (conversationId) {
      setVoiceConversationId(conversationId)
      setVoiceMode(true)
      return
    }
    try {
      const createdConversationId = await startRealtimeConversation({
        ...(search.projectId ? { projectId: search.projectId } : {}),
      })
      await open({
        slug: createdConversationId,
        ...(search.projectId ? { projectId: search.projectId } : {}),
      })
      setVoiceConversationId(createdConversationId)
      setVoiceMode(true)
    } catch {
      setProjectMenuError("Voice chat could not be created. Try again.")
    }
  }

  const selectProject = async (projectId?: string) => {
    setProjectActionFailed(false)
    try {
      if (conversationId) await moveToProject({ conversationId, projectId })
      await open({
        slug: conversationId,
        projectId,
        ...(!conversationId ? { mode: "chat-new" as const } : {}),
      })
    } catch {
      setProjectActionFailed(true)
    }
  }

  const menuItems: AIInputMenuItem[] = [
    {
      value: "add-files",
      label: "Add files or photos",
      icon: Paperclip,
      shortcut: "Ctrl U",
    },
    { value: "screenshot", label: "Take a screenshot", icon: Camera },
    {
      value: "project",
      label: "Add to project",
      icon: FolderPlus,
      items: [
        ...((selected?.projectId ?? search.projectId)
          ? [
              {
                value: "project:none",
                label: "No project",
                onClick: () => void selectProject(),
              },
            ]
          : []),
        ...(projects ?? []).map((project) => ({
          value: `project:${project._id}`,
          label: project.name,
          onClick: () => void selectProject(project._id),
        })),
        {
          value: "project:new",
          label: "Create a project",
          onClick: () => void open({ mode: "project-new" }),
        },
      ],
    },
    { value: "primary-divider", type: "separator" },
    {
      value: "connector",
      label: "Add connector",
      icon: Plug,
      onClick: () => setConnectorOpen(true),
    },
  ]

  const uploadDraftFiles = async (
    files: File[],
    onUploaded?: (count: number) => void
  ) => {
    const draftAttachmentIds: Id<"draftAttachments">[] = []
    for (const [index, file] of files.entries()) {
      const uploadUrl = await generateUploadUrl()
      const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
        },
        body: file,
      })
      if (!uploadResponse.ok) throw new Error("File upload failed")
      const storageId = readStorageId(await uploadResponse.json())
      draftAttachmentIds.push(
        await registerAttachment({ name: file.name, storageId })
      )
      onUploaded?.(index + 1)
    }
    return draftAttachmentIds
  }

  const addProjectSourceLink = () => {
    const value = projectSourceUrl.trim()
    if (!value) return
    try {
      const url = new URL(
        /^https?:\/\//i.test(value) ? value : `https://${value}`
      )
      if (!["http:", "https:"].includes(url.protocol)) throw new Error()
      url.hash = ""
      const normalized = url.toString()
      if (projectSourceLinks.includes(normalized)) {
        setProjectSourceError("That link is already in this project.")
        return
      }
      if (
        projectSourceLinks.length + projectSourceFiles.length >=
        MAX_PROJECT_SOURCES
      ) {
        setProjectSourceError(
          `Add no more than ${MAX_PROJECT_SOURCES} project sources.`
        )
        return
      }
      setProjectSourceLinks((links) => [...links, normalized])
      setProjectSourceUrl("")
      setProjectSourceError("")
    } catch {
      setProjectSourceError("Enter a valid http or https link.")
    }
  }

  const addProjectSourceFiles = (files: FileList | null) => {
    if (!files) return
    const next = [...files]
    if (
      next.some((file) => !file.size || file.size > MAX_PROJECT_SOURCE_BYTES)
    ) {
      setProjectSourceError("Each file must be between 1 byte and 20 MB.")
      return
    }
    const unique = next.filter(
      (file) =>
        !projectSourceFiles.some(
          (current) =>
            current.name === file.name &&
            current.size === file.size &&
            current.lastModified === file.lastModified
        )
    )
    if (projectSourceFiles.length + unique.length > MAX_PROJECT_SOURCE_FILES) {
      setProjectSourceError(
        `Add no more than ${MAX_PROJECT_SOURCE_FILES} files.`
      )
      return
    }
    if (
      projectSourceLinks.length + projectSourceFiles.length + unique.length >
      MAX_PROJECT_SOURCES
    ) {
      setProjectSourceError(
        `Add no more than ${MAX_PROJECT_SOURCES} project sources.`
      )
      return
    }
    setProjectSourceFiles((current) => [...current, ...unique])
    setProjectSourceError("")
  }

  const create = async () => {
    let draftAttachmentIds: Id<"draftAttachments">[] = []
    setProjectState("creating")
    try {
      draftAttachmentIds = await uploadDraftFiles(projectSourceFiles)
      const projectId = await createProject({
        instructions: projectInstructions,
        memoryScope: projectMemoryScope,
        name: projectName,
        ...(draftAttachmentIds.length
          ? { sourceDraftAttachmentIds: draftAttachmentIds }
          : {}),
        ...(projectSourceLinks.length
          ? { sourceLinks: projectSourceLinks }
          : {}),
        ...(projectEmbeddingConnectionId
          ? { embeddingProviderConnectionId: projectEmbeddingConnectionId }
          : {}),
      })
      draftAttachmentIds = []
      setProjectName("")
      setProjectInstructions("")
      setProjectSetupTab("instructions")
      setProjectMemoryScope("project_only")
      setProjectSourceFiles([])
      setProjectSourceLinks([])
      setProjectSourceUrl("")
      setProjectSourceError("")
      setProjectEmbeddingConnectionId("")
      setProjectState("idle")
      await open({ projectId, mode: "chat-new" })
    } catch {
      await Promise.allSettled(
        draftAttachmentIds.map(
          async (draftAttachmentId) =>
            await discardAttachment({ draftAttachmentId })
        )
      )
      setProjectState("failed")
    }
  }

  const uploadProjectSourceFiles = async (
    projectId: Id<"projects">,
    files: File[],
    reportProgress: (progress: number) => void
  ) => {
    let draftAttachmentIds: Id<"draftAttachments">[] = []
    try {
      draftAttachmentIds = await uploadDraftFiles(files, (uploaded) =>
        reportProgress((uploaded / (files.length + 1)) * 100)
      )
      await addProjectSources({
        projectId,
        sourceDraftAttachmentIds: draftAttachmentIds,
      })
      draftAttachmentIds = []
      reportProgress(100)
    } catch {
      await Promise.allSettled(
        draftAttachmentIds.map(
          async (draftAttachmentId) =>
            await discardAttachment({ draftAttachmentId })
        )
      )
      throw new Error("The project files could not be added. Try again.")
    }
  }

  const pinProjectEmbeddingProvider = async (
    projectId: Id<"projects">,
    providerConnectionId: Id<"providerConnections">
  ) => {
    setProjectEmbeddingActionError("")
    setProjectEmbeddingActionPending(true)
    try {
      await configureProjectEmbeddings({ projectId, providerConnectionId })
    } catch {
      setProjectEmbeddingActionError(
        "The embedding provider could not be updated. Check the connection and try again."
      )
    } finally {
      setProjectEmbeddingActionPending(false)
    }
  }

  const retryProjectSource = async (
    projectId: Id<"projects">,
    sourceId?: Id<"projectSources">
  ) => {
    if (!sourceId) return
    setProjectEmbeddingActionError("")
    setProjectEmbeddingActionPending(true)
    try {
      await retryProjectSourceIndexing({ projectId, sourceId })
    } catch {
      setProjectEmbeddingActionError(
        "The source could not be queued for indexing. Try again."
      )
    } finally {
      setProjectEmbeddingActionPending(false)
    }
  }

  const removeProjectSourceFromProject = async (
    projectId: Id<"projects">,
    sourceId: Id<"projectSources">
  ) => {
    setProjectEmbeddingActionError("")
    setProjectEmbeddingActionPending(true)
    try {
      await removeProjectSource({ projectId, sourceId })
    } catch {
      setProjectEmbeddingActionError(
        "The source could not be removed. Try again."
      )
    } finally {
      setProjectEmbeddingActionPending(false)
    }
  }

  const leaveIfSelected = async (targetId: string) => {
    if (conversationId === targetId) {
      await open({ projectId: search.projectId, mode: "chat-new" })
    }
  }

  const archiveChat = async (targetId: string) => {
    setConversationActionId(targetId)
    try {
      await archiveConversation({ conversationId: targetId })
      await leaveIfSelected(targetId)
    } finally {
      setConversationActionId(null)
    }
  }

  const deleteChat = async (targetId: string) => {
    setConversationActionId(targetId)
    try {
      await removeConversation({ conversationId: targetId })
      await leaveIfSelected(targetId)
    } finally {
      setConversationActionId(null)
    }
  }

  const renameProject = async (project: Doc<"projects">) => {
    const name = window.prompt("Rename project", project.name)?.trim()
    if (!name || name === project.name) return
    setProjectMenuActionId(project._id)
    setProjectMenuError("")
    try {
      await renameProjectMutation({ name, projectId: project._id })
    } catch {
      setProjectMenuError("The project could not be renamed. Try again.")
    } finally {
      setProjectMenuActionId(null)
    }
  }

  const deleteProject = async (project: Doc<"projects">) => {
    if (
      !window.confirm(
        `Delete "${project.name}"? Its chats will move to Recent chats.`
      )
    )
      return
    setProjectMenuActionId(project._id)
    setProjectMenuError("")
    try {
      await removeProject({ projectId: project._id })
      if (expandedProjectId === project._id) setExpandedProjectId(undefined)
      if (search.projectId === project._id) await open({ mode: "chat-new" })
    } catch {
      setProjectMenuError("The project could not be deleted. Try again.")
    } finally {
      setProjectMenuActionId(null)
    }
  }

  const send = async (
    content: string,
    meta: { provider: string; settings: Record<string, string> },
    files: File[]
  ) => {
    let draftAttachmentIds: Id<"draftAttachments">[] = []
    setSendState("sending")
    try {
      if (!isActiveProvider(meta.provider))
        throw new Error("Provider unavailable")
      const provider = meta.provider
      const providerConnectionId = connections?.find(
        (connection) =>
          connection.provider === provider && connection.status === "connected"
      )?.connectionId
      const desktopCodexMessages =
        provider === "codex" && conversationId
          ? (messages ?? [])
              .filter(
                (message) =>
                  message.status === "complete" &&
                  (message.role === "assistant" || message.role === "user")
              )
              .map((message) => ({
                content: message.content,
                role: message.role as "assistant" | "user",
              }))
          : []

      if (provider === "codex" && files.length)
        throw new Error("Attachments are not available with Codex yet")
      draftAttachmentIds = await uploadDraftFiles(files)

      let targetConversationId = conversationId
      if (conversationId) {
        if (!meta.settings.model) throw new Error("Model unavailable")
        await sendMessage({
          conversationId,
          content,
          ...(draftAttachmentIds.length ? { draftAttachmentIds } : {}),
          model: meta.settings.model,
          ...(provider === "openrouter" && meta.settings.routingProvider
            ? { routingProvider: meta.settings.routingProvider }
            : {}),
          ...(meta.settings.effort
            ? { reasoningEffort: meta.settings.effort }
            : {}),
        })
      } else {
        if (!providerConnectionId || !meta.settings.model)
          throw new Error("Model unavailable")
        const slug = await startConversation({
          content,
          ...(draftAttachmentIds.length ? { draftAttachmentIds } : {}),
          model: meta.settings.model,
          outputMode,
          projectId: search.projectId,
          providerConnectionId,
          ...(provider === "openrouter" && meta.settings.routingProvider
            ? { routingProvider: meta.settings.routingProvider }
            : {}),
          ...(meta.settings.effort
            ? { reasoningEffort: meta.settings.effort }
            : {}),
        })
        targetConversationId = slug
        await open({ slug, projectId: search.projectId })
      }
      if (provider === "codex" && targetConversationId) {
        const desktop = getDesktopApi()
        if (!desktop)
          throw new Error("Codex is only available in the desktop app")
        if (!conversationId)
          void generateDesktopChatTitle({
            conversationId: targetConversationId,
            desktop,
            initialQuestion: content,
            model: meta.settings.model,
            setGeneratedTitle: setDesktopCodexGeneratedTitle,
          })
        try {
          const projectSourceContext = await getDesktopCodexProjectContext({
            conversationId: targetConversationId,
          }).catch(() => {
            console.warn(
              "Project source context unavailable; continuing Codex generation without it."
            )
            return ""
          })
          const memoryContext = await getDesktopCodexMemoryContext({
            conversationId: targetConversationId,
          }).catch(() => ({
            budgetUsed: 0,
            historySummaryIds: [],
            memoryMode: "off" as const,
            referenceText: "",
            selectedMemoryItemIds: [],
          }))
          const result = await desktop.codex.generate({
            model: meta.settings.model,
            ...(meta.settings.effort ? { effort: meta.settings.effort } : {}),
            developerInstructions: [
              "Answer as a general-purpose assistant inside Dev3. Do not inspect files, run commands, or modify the filesystem.",
              selectedProject?.instructions,
              preferences?.responseDetail
                ? `Response detail: ${preferences.responseDetail}.`
                : undefined,
            ]
              .filter(Boolean)
              .join("\n"),
            messages: [
              ...desktopCodexMessages,
              ...(projectSourceContext
                ? [
                    {
                      content: `Reference context for the next user request:\n${projectSourceContext}`,
                      role: "user" as const,
                    },
                  ]
                : []),
              ...(memoryContext.referenceText
                ? [
                    {
                      content: `Reference context for the next user request:\n${memoryContext.referenceText}`,
                      role: "user" as const,
                    },
                  ]
                : []),
              { content, role: "user" as const },
            ],
          })
          await finishDesktopCodexResponse({
            conversationId: targetConversationId,
            content: result.content,
            failed: false,
            ...(memoryContext.selectedMemoryItemIds.length
              ? { memoryItemIds: memoryContext.selectedMemoryItemIds }
              : {}),
            ...(result.reasoningSteps.length
              ? { reasoningSteps: result.reasoningSteps }
              : {}),
            ...(memoryContext.historySummaryIds.length
              ? { summaryIds: memoryContext.historySummaryIds }
              : {}),
          })
        } catch (cause) {
          try {
            await finishDesktopCodexResponse({
              conversationId: targetConversationId,
              content:
                "Codex could not complete this response. Reconnect your ChatGPT subscription and try again.",
              failed: true,
            })
          } catch {
            // Preserve the original local Codex error for the composer state.
          }
          throw cause
        }
      }
      setSendState("idle")
    } catch {
      await Promise.allSettled(
        draftAttachmentIds.map(
          async (draftAttachmentId) =>
            await discardAttachment({ draftAttachmentId })
        )
      )
      setSendState("failed")
      throw new Error("Message could not be sent")
    }
  }

  const renderConversation = (conversation: Doc<"conversations">) => (
    <SidebarMenuItem key={conversation._id}>
      <SidebarMenuButton
        className="rounded-xl px-2.5 transition-[background-color,color,box-shadow] duration-150 hover:bg-sidebar-accent/60 data-active:bg-sidebar-accent data-active:text-sidebar-accent-foreground data-active:shadow-sm"
        isActive={conversationId === conversation._id}
        render={
          <button
            onClick={() =>
              open({
                projectId: conversation.projectId,
                slug: conversation._id,
              })
            }
            type="button"
          />
        }
      >
        <span className="truncate">{conversation.title}</span>
      </SidebarMenuButton>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <SidebarMenuAction
              aria-label={`Chat actions for ${conversation.title}`}
              disabled={conversationActionId === conversation._id}
              showOnHover
            />
          }
        >
          <HugeiconsIcon
            aria-hidden="true"
            icon={MoreHorizontalIcon}
            strokeWidth={2}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="right">
          <DropdownMenuItem
            disabled={conversationActionId === conversation._id}
            onClick={() => void archiveChat(conversation._id)}
          >
            <HugeiconsIcon
              aria-hidden="true"
              icon={Archive02Icon}
              strokeWidth={1.8}
            />
            Archive
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={conversationActionId === conversation._id}
            onClick={() => void deleteChat(conversation._id)}
            variant="destructive"
          >
            <HugeiconsIcon
              aria-hidden="true"
              icon={Delete02Icon}
              strokeWidth={1.8}
            />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  )

  return (
    <SidebarProvider className="chat-workspace-shell h-svh overflow-hidden">
      <Sidebar className="chat-workspace-sidebar" collapsible="offcanvas">
        <SidebarHeader className="gap-2 border-b border-sidebar-border/50 p-2.5">
          <a
            aria-label="Dev3 home"
            className="flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            href="/chat"
          >
            <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#0B0D12] p-1.5 shadow-sm ring-1 ring-sidebar-border/70">
              <Dev3Mark className="size-full" mode="dark" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold tracking-tight text-sidebar-foreground">
                Dev3
              </span>
              <span className="mt-0.5 block truncate text-[10px] font-medium tracking-[0.14em] text-sidebar-foreground/45 uppercase">
                Workspace
              </span>
            </span>
          </a>
          <SidebarModeControls
            disabled={Boolean(conversationId) || sendState === "sending"}
            hasImageProvider={hasImageProvider}
            mode={outputMode}
            onModeChange={setOutputMode}
            onVoiceActivate={() => void activateVoice()}
          />
          <Button
            className="h-8 w-full justify-start rounded-lg px-2.5 text-sidebar-foreground shadow-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            onClick={() =>
              open({ mode: "chat-new", projectId: search.projectId })
            }
            size="sm"
            variant="ghost"
          >
            <HugeiconsIcon
              aria-hidden="true"
              icon={Add01Icon}
              strokeWidth={2}
            />{" "}
            New chat
          </Button>
          <ProviderConnectDialog
            onOpenChange={setConnectorOpen}
            open={connectorOpen}
          />
          <div className="relative">
            <HugeiconsIcon
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-2.5 z-10 size-4 -translate-y-1/2 text-sidebar-foreground/45"
              icon={Search01Icon}
              strokeWidth={1.8}
            />
            <SidebarInput
              aria-label="Search recent chats"
              className="h-8 rounded-lg border-sidebar-border/60 bg-background/55 pl-8 transition-colors focus-visible:bg-background"
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search chats"
              value={searchQuery}
            />
          </div>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                className="rounded-lg px-2.5 transition-[background-color,color,box-shadow] duration-150 hover:bg-sidebar-accent/60 data-active:bg-sidebar-accent data-active:text-sidebar-accent-foreground data-active:shadow-sm"
                isActive={search.mode === "library"}
                onClick={() => void open({ mode: "library" })}
              >
                <LibraryBig aria-hidden="true" />
                <span>Library</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent className="gap-0 px-2 py-2">
          <SidebarGroup className="p-1.5">
            <SidebarGroupLabel className="h-6 px-2 text-[10px] font-semibold tracking-[0.14em] text-sidebar-foreground/45 uppercase">
              Projects
            </SidebarGroupLabel>
            <SidebarGroupAction
              aria-label="Create new project"
              onClick={() => open({ mode: "project-new" })}
              title="Create new project"
            >
              <HugeiconsIcon
                aria-hidden="true"
                icon={Add01Icon}
                strokeWidth={2}
              />
            </SidebarGroupAction>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {projects === undefined ? (
                  <SidebarMenuSkeleton />
                ) : (
                  projects.map((project) => {
                    const isActive = search.projectId === project._id
                    const isExpanded = expandedProjectId === project._id
                    return (
                      <SidebarMenuItem key={project._id}>
                        <SidebarMenuButton
                          className="rounded-lg px-2.5 pr-14 transition-[background-color,color,box-shadow] duration-150 hover:bg-sidebar-accent/60 data-active:bg-sidebar-accent data-active:text-sidebar-accent-foreground data-active:shadow-sm"
                          isActive={isActive}
                          render={
                            <button
                              aria-expanded={isExpanded}
                              onClick={() => {
                                const nextExpandedProjectId =
                                  toggleExpandedProject(
                                    expandedProjectId,
                                    project._id
                                  )
                                setExpandedProjectId(nextExpandedProjectId)
                                if (nextExpandedProjectId && !isActive)
                                  void open({ projectId: project._id })
                              }}
                              type="button"
                            />
                          }
                        >
                          <Folder aria-hidden="true" className="size-4" />
                          <span className="min-w-0 flex-1 truncate">
                            {project.name}
                          </span>
                        </SidebarMenuButton>
                        <SidebarMenuAction
                          aria-label={`Start a new chat in ${project.name}`}
                          className="right-7"
                          disabled={projectMenuActionId === project._id}
                          onClick={() =>
                            open({ mode: "project", projectId: project._id })
                          }
                          showOnHover
                          title="Open project"
                        >
                          <HugeiconsIcon
                            aria-hidden="true"
                            icon={Edit02Icon}
                            strokeWidth={1.8}
                          />
                        </SidebarMenuAction>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <SidebarMenuAction
                                aria-label={`Project actions for ${project.name}`}
                                disabled={projectMenuActionId === project._id}
                                showOnHover
                              />
                            }
                          >
                            <HugeiconsIcon
                              aria-hidden="true"
                              icon={MoreHorizontalIcon}
                              strokeWidth={2}
                            />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" side="right">
                            <DropdownMenuItem
                              onClick={() => void renameProject(project)}
                            >
                              <HugeiconsIcon
                                aria-hidden="true"
                                icon={Edit02Icon}
                                strokeWidth={1.8}
                              />
                              Rename
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => void deleteProject(project)}
                              variant="destructive"
                            >
                              <HugeiconsIcon
                                aria-hidden="true"
                                icon={Delete02Icon}
                                strokeWidth={1.8}
                              />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <ProjectConversationDisclosure open={isExpanded}>
                          {isActive ? (
                            <SidebarMenu className="mt-1 ml-3 w-[calc(100%-0.75rem)] gap-0.5 border-l border-sidebar-border/50 pl-2">
                              {filteredProjectConversations === undefined ? (
                                <SidebarMenuSkeleton />
                              ) : filteredProjectConversations.length === 0 ? (
                                <p className="px-2 py-2 text-xs text-sidebar-foreground/55">
                                  {searchQuery
                                    ? "No matching project chats"
                                    : "No chats in this project yet"}
                                </p>
                              ) : (
                                <CappedConversationList
                                  conversations={filteredProjectConversations}
                                  renderConversation={renderConversation}
                                />
                              )}
                            </SidebarMenu>
                          ) : null}
                        </ProjectConversationDisclosure>
                      </SidebarMenuItem>
                    )
                  })
                )}
              </SidebarMenu>
              {projectMenuError ? (
                <p
                  aria-live="polite"
                  className="px-2 pt-2 text-xs text-destructive"
                >
                  {projectMenuError}
                </p>
              ) : null}
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarGroup className="p-1.5 pt-2">
            <SidebarGroupLabel className="h-6 px-2 text-[10px] font-semibold tracking-[0.14em] text-sidebar-foreground/45 uppercase">
              Recent chats
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {filteredRecentConversations === undefined ? (
                  <SidebarMenuSkeleton />
                ) : filteredRecentConversations.length === 0 ? (
                  <p className="px-2 py-2 text-xs text-sidebar-foreground/55">
                    {searchQuery
                      ? "No matching conversations"
                      : "No chats outside projects yet"}
                  </p>
                ) : (
                  <CappedConversationList
                    conversations={filteredRecentConversations}
                    renderConversation={renderConversation}
                  />
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="gap-1.5 border-t border-sidebar-border/50 bg-sidebar/35 p-2">
          {conversationId ? (
            <Select
              aria-label="Chat memory mode"
              onValueChange={(memoryMode) => {
                if (!memoryMode) return
                void setMemoryMode({
                  conversationId,
                  memoryMode,
                })
              }}
              value={selected?.memoryMode ?? "standard"}
            >
              <SelectTrigger
                aria-label="Chat memory mode"
                className="w-full justify-between"
                size="sm"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">Memory: standard</SelectItem>
                <SelectItem value="read_only">Memory: read only</SelectItem>
                <SelectItem value="off">Memory: off</SelectItem>
              </SelectContent>
            </Select>
          ) : null}
          <SidebarUserMenu
            desktopAvailable={desktopAvailable}
            email={viewer?.email}
            name={viewer?.name}
            onOpenAppUpdates={openDesktopUpdaterDialog}
            onOpenArchivedChats={() => setArchivedOpen(true)}
            onOpenSettings={() => setSettingsOpen(true)}
          />
          {settingsOpen ? (
            <OptionalChatFeatureBoundary
              fallback={
                <Dialog open onOpenChange={setSettingsOpen}>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Settings unavailable</DialogTitle>
                      <DialogDescription>
                        Close this window and try again after the app finishes
                        updating.
                      </DialogDescription>
                    </DialogHeader>
                  </DialogContent>
                </Dialog>
              }
            >
              <PersonalizationCenter
                models={currentCatalog}
                onOpenChange={setSettingsOpen}
                onOpenProviders={() => {
                  setSettingsOpen(false)
                  setConnectorOpen(true)
                }}
                open
              />
            </OptionalChatFeatureBoundary>
          ) : null}
          <ArchivedChatsDialog
            onOpenChange={setArchivedOpen}
            onOpenChat={(conversation) =>
              open({
                projectId: conversation.projectId,
                slug: conversation.slug,
              })
            }
            open={archivedOpen}
          />
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="chat-workspace-stage">
        <header className="chat-workspace-header flex shrink-0 items-center gap-3 border-b px-3 sm:px-4">
          <SidebarTrigger />
          <div className="min-w-0">
            {selectedProject && search.mode !== "project" ? (
              <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                <Folder
                  aria-hidden="true"
                  className="size-3 shrink-0"
                  strokeWidth={1.5}
                />
                <span className="shrink-0">Project</span>
                <span aria-hidden="true">:</span>
                <span className="truncate font-medium text-foreground/80">
                  {selectedProject.name}
                </span>
              </p>
            ) : (
              <p className="chat-workspace-kicker">
                {search.mode === "library" ? "Your content" : "AI workspace"}
              </p>
            )}
            <p className="truncate text-sm font-semibold tracking-tight">
              {search.mode === "library"
                ? "Library"
                : search.mode === "project"
                  ? (selectedProject?.name ?? "Project")
                  : (selected?.title ?? "New chat")}
            </p>
          </div>
        </header>
        <section
          className="flex min-h-0 flex-1 flex-col"
          aria-label="Chat workspace"
        >
          {search.mode === "library" ? (
            <Suspense
              fallback={<ChatStatus loading message="Loading Library…" />}
            >
              <OptionalChatFeatureBoundary
                fallback={
                  <ChatStatus message="Library is temporarily unavailable." />
                }
              >
                <LibraryWorkspace
                  onOpenConversation={(nextConversationId, messageId) =>
                    void open({ slug: nextConversationId, messageId })
                  }
                  onOpenProject={(projectId) =>
                    void open({ mode: "project", projectId })
                  }
                />
              </OptionalChatFeatureBoundary>
            </Suspense>
          ) : search.mode === "project" ? (
            selectedProject ? (
              <ProjectWorkspace
                embeddingActionError={projectEmbeddingActionError}
                embeddingActionPending={projectEmbeddingActionPending}
                embeddingConnections={connections}
                embeddingProfile={projectEmbeddingProfile}
                conversations={projectConversations}
                onConnectEmbeddingProvider={() => setConnectorOpen(true)}
                onNewChat={() =>
                  open({ mode: "chat-new", projectId: selectedProject._id })
                }
                onOpenChat={(slug) =>
                  open({ projectId: selectedProject._id, slug })
                }
                onPinEmbeddingProvider={(connectionId) =>
                  pinProjectEmbeddingProvider(selectedProject._id, connectionId)
                }
                onRetrySource={(sourceId) =>
                  retryProjectSource(selectedProject._id, sourceId)
                }
                onRemoveSource={(sourceId) =>
                  removeProjectSourceFromProject(selectedProject._id, sourceId)
                }
                onUploadFiles={(files, reportProgress) =>
                  uploadProjectSourceFiles(
                    selectedProject._id,
                    files,
                    reportProgress
                  )
                }
                project={selectedProject}
                sources={projectSources}
              />
            ) : (
              <ChatStatus message="That project is unavailable." />
            )
          ) : search.mode === "project-new" ? (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="mx-auto grid min-h-full w-full max-w-6xl lg:grid-cols-[minmax(0,1fr)_17rem]">
                <main className="min-w-0 px-5 py-6 md:px-8 md:py-8">
                  <header className="mb-6 flex items-start gap-3">
                    <HugeiconsIcon
                      aria-hidden="true"
                      className="mt-0.5 size-5 text-primary"
                      icon={FolderAddIcon}
                      strokeWidth={1.7}
                    />
                    <div>
                      <h1 className="font-heading text-xl font-semibold tracking-tight">
                        Start a project
                      </h1>
                      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                        Set the context once. Every chat in this project will
                        use these instructions, sources, and memory rules.
                      </p>
                    </div>
                  </header>

                  <div className="mb-5 grid gap-2 border-b pb-5">
                    <label
                      className="text-sm font-medium"
                      htmlFor="project-name"
                    >
                      Project name
                    </label>
                    <Input
                      className="max-w-xl"
                      id="project-name"
                      maxLength={80}
                      onChange={(event) => setProjectName(event.target.value)}
                      placeholder="Website redesign"
                      value={projectName}
                    />
                  </div>

                  <Tabs
                    onValueChange={(value) => {
                      if (isProjectSetupTab(value)) setProjectSetupTab(value)
                    }}
                    value={projectSetupTab}
                  >
                    <TabsList className="mb-5" variant="line">
                      <TabsTrigger value="instructions">
                        <HugeiconsIcon
                          aria-hidden="true"
                          icon={AiBrain01Icon}
                          strokeWidth={1.7}
                        />
                        Instructions
                      </TabsTrigger>
                      <TabsTrigger value="sources">
                        <HugeiconsIcon
                          aria-hidden="true"
                          icon={FileAttachmentIcon}
                          strokeWidth={1.7}
                        />
                        Sources
                        {projectSourceFiles.length +
                        projectSourceLinks.length ? (
                          <span className="text-xs text-primary">
                            {projectSourceFiles.length +
                              projectSourceLinks.length}
                          </span>
                        ) : null}
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent
                      className="grid gap-6 md:grid-cols-[minmax(0,1.2fr)_minmax(15rem,.8fr)]"
                      value="instructions"
                    >
                      <div className="grid content-start gap-2">
                        <label
                          className="text-sm font-medium"
                          htmlFor="project-instructions"
                        >
                          Project instructions
                        </label>
                        <Textarea
                          aria-describedby="project-instructions-description"
                          className="min-h-44 resize-y"
                          id="project-instructions"
                          maxLength={8000}
                          onChange={(event) =>
                            setProjectInstructions(event.target.value)
                          }
                          placeholder="Goals, constraints, stack, terminology, or response style to use in every chat."
                          value={projectInstructions}
                        />
                        <p
                          className="text-xs leading-relaxed text-muted-foreground"
                          id="project-instructions-description"
                        >
                          Keep these durable and project-specific. Never include
                          secrets or credentials.
                        </p>
                      </div>

                      <fieldset className="min-w-0">
                        <legend className="mb-2 text-sm font-medium">
                          Memory scope
                        </legend>
                        <div className="border-y">
                          <label
                            className="flex cursor-pointer items-start gap-3 border-b py-3 transition-colors hover:text-foreground"
                            htmlFor="memory-project-only"
                          >
                            <input
                              checked={projectMemoryScope === "project_only"}
                              className="mt-0.5 size-4 shrink-0 accent-primary outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                              id="memory-project-only"
                              name="project-memory-scope"
                              onChange={() =>
                                setProjectMemoryScope("project_only")
                              }
                              type="radio"
                              value="project_only"
                            />
                            <span className="grid gap-1">
                              <span className="text-sm font-medium">
                                Project only
                              </span>
                              <span className="text-xs leading-relaxed text-muted-foreground">
                                Keep this project isolated from other chat
                                memory.
                              </span>
                            </span>
                          </label>
                          <label
                            className="flex cursor-pointer items-start gap-3 py-3 transition-colors hover:text-foreground"
                            htmlFor="memory-all-chats"
                          >
                            <input
                              checked={projectMemoryScope === "all_chats"}
                              className="mt-0.5 size-4 shrink-0 accent-primary outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                              id="memory-all-chats"
                              name="project-memory-scope"
                              onChange={() =>
                                setProjectMemoryScope("all_chats")
                              }
                              type="radio"
                              value="all_chats"
                            />
                            <span className="grid gap-1">
                              <span className="text-sm font-medium">
                                Full memory
                              </span>
                              <span className="text-xs leading-relaxed text-muted-foreground">
                                Include useful personal memory from chats
                                outside this project.
                              </span>
                            </span>
                          </label>
                        </div>
                      </fieldset>
                    </TabsContent>

                    <TabsContent className="grid gap-5" value="sources">
                      <section
                        aria-labelledby="new-project-embedding-heading"
                        className="rounded-2xl bg-muted/35 p-4 ring-1 ring-border/70"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <h2
                              className="text-sm font-semibold"
                              id="new-project-embedding-heading"
                            >
                              Semantic search
                            </h2>
                            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                              Pin one provider for source indexing and project
                              retrieval. You can re-index with another provider
                              later.
                            </p>
                          </div>
                          {embeddingConnections.length ? (
                            <NativeSelect
                              aria-label="Project embedding provider"
                              className="w-full sm:w-auto"
                              onChange={(event) =>
                                setProjectEmbeddingConnectionId(
                                  event.target
                                    .value as Id<"providerConnections">
                                )
                              }
                              value={projectEmbeddingConnectionId}
                            >
                              <NativeSelectOption value="">
                                Index later
                              </NativeSelectOption>
                              {embeddingConnections.map((connection) => (
                                <NativeSelectOption
                                  key={connection.connectionId}
                                  value={connection.connectionId}
                                >
                                  {connection.displayName ??
                                    (connection.provider === "openai"
                                      ? "OpenAI"
                                      : "OpenRouter")}
                                </NativeSelectOption>
                              ))}
                            </NativeSelect>
                          ) : (
                            <Button
                              onClick={() => setConnectorOpen(true)}
                              size="sm"
                              type="button"
                              variant="outline"
                            >
                              Connect OpenAI or OpenRouter
                            </Button>
                          )}
                        </div>
                      </section>
                      <div className="grid gap-5 md:grid-cols-2">
                        <section aria-labelledby="source-link-heading">
                          <div className="mb-2 flex items-center gap-2">
                            <HugeiconsIcon
                              aria-hidden="true"
                              className="size-4 text-muted-foreground"
                              icon={Link01Icon}
                              strokeWidth={1.7}
                            />
                            <h2
                              className="text-sm font-medium"
                              id="source-link-heading"
                            >
                              Add a link
                            </h2>
                          </div>
                          <div className="flex gap-2">
                            <Input
                              aria-label="Source URL"
                              id="project-source-url"
                              onChange={(event) =>
                                setProjectSourceUrl(event.target.value)
                              }
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault()
                                  addProjectSourceLink()
                                }
                              }}
                              placeholder="docs.example.com/guide"
                              value={projectSourceUrl}
                            />
                            <Button
                              aria-label="Add source link"
                              disabled={!projectSourceUrl.trim()}
                              onClick={addProjectSourceLink}
                              size="icon"
                              variant="secondary"
                            >
                              <HugeiconsIcon
                                aria-hidden="true"
                                icon={Add01Icon}
                                strokeWidth={1.7}
                              />
                            </Button>
                          </div>
                          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                            Web pages are fetched when the connected model needs
                            them.
                          </p>
                        </section>

                        <section aria-labelledby="source-file-heading">
                          <div className="mb-2 flex items-center gap-2">
                            <HugeiconsIcon
                              aria-hidden="true"
                              className="size-4 text-muted-foreground"
                              icon={FileAttachmentIcon}
                              strokeWidth={1.7}
                            />
                            <h2
                              className="text-sm font-medium"
                              id="source-file-heading"
                            >
                              Add files
                            </h2>
                          </div>
                          <input
                            className="sr-only"
                            id="project-source-files"
                            multiple
                            onChange={(event) => {
                              addProjectSourceFiles(event.target.files)
                              event.currentTarget.value = ""
                            }}
                            type="file"
                          />
                          <label
                            className="inline-flex h-8 w-full cursor-pointer items-center justify-start gap-1.5 rounded-2xl border border-dashed border-border bg-background px-3 text-sm font-medium transition-colors focus-within:ring-3 focus-within:ring-ring/30 hover:bg-muted hover:text-foreground"
                            htmlFor="project-source-files"
                          >
                            <HugeiconsIcon
                              aria-hidden="true"
                              icon={Upload04Icon}
                              strokeWidth={1.7}
                            />
                            Choose up to 5 files
                          </label>
                          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                            PDFs, images, text, and documents up to 20 MB each.
                          </p>
                        </section>
                      </div>

                      <section
                        className="border-t pt-4"
                        aria-labelledby="sources-heading"
                      >
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <h2
                            className="text-sm font-medium"
                            id="sources-heading"
                          >
                            Project sources
                          </h2>
                          <span className="text-xs text-muted-foreground">
                            {projectSourceFiles.length +
                              projectSourceLinks.length}
                            /{MAX_PROJECT_SOURCES}
                          </span>
                        </div>
                        {projectSourceFiles.length ||
                        projectSourceLinks.length ? (
                          <ul className="max-h-40 divide-y overflow-y-auto border-y">
                            {projectSourceFiles.map((file) => (
                              <li
                                className="flex min-w-0 items-center gap-3 py-2.5"
                                key={`${file.name}-${file.size}-${file.lastModified}`}
                              >
                                <HugeiconsIcon
                                  aria-hidden="true"
                                  className="size-4 shrink-0 text-muted-foreground"
                                  icon={FileAttachmentIcon}
                                  strokeWidth={1.7}
                                />
                                <span className="min-w-0 flex-1 truncate text-sm">
                                  {file.name}
                                </span>
                                <span className="shrink-0 text-xs text-muted-foreground">
                                  {formatFileSize(file.size)}
                                </span>
                                <Button
                                  aria-label={`Remove ${file.name}`}
                                  onClick={() =>
                                    setProjectSourceFiles((files) =>
                                      files.filter(
                                        (candidate) => candidate !== file
                                      )
                                    )
                                  }
                                  size="icon-xs"
                                  variant="ghost"
                                >
                                  <HugeiconsIcon
                                    aria-hidden="true"
                                    icon={Cancel01Icon}
                                    strokeWidth={1.7}
                                  />
                                </Button>
                              </li>
                            ))}
                            {projectSourceLinks.map((url) => (
                              <li
                                className="flex min-w-0 items-center gap-3 py-2.5"
                                key={url}
                              >
                                <HugeiconsIcon
                                  aria-hidden="true"
                                  className="size-4 shrink-0 text-muted-foreground"
                                  icon={Link01Icon}
                                  strokeWidth={1.7}
                                />
                                <span className="min-w-0 flex-1 truncate text-sm">
                                  {url}
                                </span>
                                <Button
                                  aria-label={`Remove ${url}`}
                                  onClick={() =>
                                    setProjectSourceLinks((links) =>
                                      links.filter(
                                        (candidate) => candidate !== url
                                      )
                                    )
                                  }
                                  size="icon-xs"
                                  variant="ghost"
                                >
                                  <HugeiconsIcon
                                    aria-hidden="true"
                                    icon={Cancel01Icon}
                                    strokeWidth={1.7}
                                  />
                                </Button>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="border-y py-4 text-sm text-muted-foreground">
                            No sources yet. Add only the material this project
                            should rely on.
                          </p>
                        )}
                        {projectSourceError ? (
                          <p
                            aria-live="polite"
                            className="mt-2 text-xs text-destructive"
                          >
                            {projectSourceError}
                          </p>
                        ) : null}
                      </section>
                    </TabsContent>
                  </Tabs>
                </main>

                <aside className="border-t bg-muted/10 px-5 py-6 lg:border-t-0 lg:border-l lg:px-6 lg:py-8">
                  <div className="lg:sticky lg:top-8">
                    <ProjectContextProgress
                      instructions={projectInstructions}
                      name={projectName}
                      onSelect={(item) => {
                        const target =
                          item === "name"
                            ? "project-name"
                            : item === "instructions"
                              ? "project-instructions"
                              : "project-source-url"
                        if (item !== "name")
                          setProjectSetupTab(
                            item === "instructions" ? "instructions" : "sources"
                          )
                        requestAnimationFrame(() =>
                          document.getElementById(target)?.focus()
                        )
                      }}
                      sourceCount={
                        projectSourceFiles.length + projectSourceLinks.length
                      }
                    />
                    <Button
                      className="mt-5 w-full"
                      disabled={
                        !projectName.trim() || projectState === "creating"
                      }
                      onClick={() => void create()}
                    >
                      {projectState === "creating"
                        ? "Creating project..."
                        : "Create project"}
                    </Button>
                    {projectState === "failed" ? (
                      <p
                        aria-live="polite"
                        className="mt-3 text-xs leading-relaxed text-destructive"
                      >
                        We could not create the project or upload its sources.
                        Try again.
                      </p>
                    ) : null}
                  </div>
                </aside>
              </div>
            </div>
          ) : voiceMode && voiceConversationId ? (
            <Suspense
              fallback={<ChatStatus loading message="Starting voice…" />}
            >
              <RealtimeVoice
                conversationId={voiceConversationId}
                onClose={() => {
                  setVoiceMode(false)
                  setVoiceConversationId(null)
                }}
              />
            </Suspense>
          ) : selected === null && conversationId ? (
            <ChatStatus message="That conversation is unavailable." />
          ) : (
            <>
              <MessageArea
                actionsDisabled={
                  sendState === "sending" ||
                  selected?.status === "archived" ||
                  !activeConnectionId ||
                  catalogState !== "ready" ||
                  providerModels.length === 0
                }
                conversationId={selected?._id}
                messages={conversationId ? messages : []}
                name={viewer?.name}
                onManageMemory={() => setSettingsOpen(true)}
                onAction={(value) => {
                  void send(
                    value,
                    { provider: activeProvider, settings: defaultSettings },
                    []
                  ).catch(() => undefined)
                }}
                userMessageBubbleColor={preferences?.userMessageBubbleColor}
                targetMessageId={search.messageId}
              />
              <div className="chat-composer-dock sticky bottom-0 z-10 w-full px-4 pt-6 pb-3 sm:px-5">
                <div className="mx-auto w-full max-w-3xl">
                  {selected?.status === "archived" ? (
                    <p className="mb-2 text-center text-xs text-muted-foreground">
                      This chat is archived. Restore it from your profile menu
                      to keep chatting.
                    </p>
                  ) : null}
                  {catalogState === "failed" ? (
                    <p
                      className="mb-2 text-center text-xs text-destructive"
                      role="alert"
                    >
                      Provider models could not be loaded. Check your provider
                      connection.
                    </p>
                  ) : null}
                  <AIInput
                    defaultProvider={activeProvider}
                    defaultSettings={defaultSettings}
                    disabled={
                      sendState === "sending" ||
                      selected?.status === "archived" ||
                      !activeConnectionId ||
                      catalogState !== "ready" ||
                      providerModels.length === 0
                    }
                    footerAccessory={
                      contextMessage?.contextTokens !== undefined &&
                      contextModel?.contextLength ? (
                        <Context
                          maxTokens={contextModel.contextLength}
                          usedTokens={contextMessage.contextTokens}
                        >
                          <ContextTrigger
                            aria-label="View session context usage"
                            className="px-2 text-xs"
                          />
                          <ContextContent align="end" side="top">
                            <ContextContentHeader />
                          </ContextContent>
                        </Context>
                      ) : null
                    }
                    onProviderChange={(value) => {
                      if (isActiveProvider(value)) setActiveProvider(value)
                    }}
                    onSettingsChange={(settings) =>
                      setSelectedModelId(settings.model)
                    }
                    onSend={send}
                    menuItems={menuItems}
                    placeholder={
                      selected?.status === "archived"
                        ? "Restore this chat to continue messaging"
                        : !activeConnection
                          ? "Connect a provider to choose a model"
                          : catalogState === "loading"
                            ? "Loading provider models..."
                            : catalogState === "failed"
                              ? "Reconnect your provider to continue"
                              : activeProvider === "cursor"
                                ? "Cursor chat is not available yet"
                                : selectedModel
                                  ? outputMode === "image"
                                    ? `Describe an image for ${selectedModel.label}`
                                    : `Message ${selectedModel.label}`
                                  : "Choose a model"
                    }
                    providerDisabled={
                      Boolean(conversationId) || sendState === "sending"
                    }
                    providers={executionProviderOptions}
                    settingGroups={settingGroups}
                    showMessages={false}
                  />
                  {sendState === "failed" ? (
                    <p
                      aria-live="polite"
                      className="mt-2 text-center text-xs text-destructive"
                    >
                      Your message was not saved. Try again.
                    </p>
                  ) : null}
                  {projectActionFailed ? (
                    <p
                      aria-live="polite"
                      className="mt-2 text-center text-xs text-destructive"
                    >
                      This chat could not be added to the project. Try again.
                    </p>
                  ) : null}
                </div>
              </div>
            </>
          )}
        </section>
      </SidebarInset>
    </SidebarProvider>
  )
}

function formatProjectDate(value: number) {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year:
      new Date(value).getFullYear() === new Date().getFullYear()
        ? undefined
        : "numeric",
  }).format(value)
}

function ProjectWorkspace({
  conversations,
  embeddingActionError,
  embeddingActionPending,
  embeddingConnections,
  embeddingProfile,
  onConnectEmbeddingProvider,
  onNewChat,
  onOpenChat,
  onPinEmbeddingProvider,
  onRemoveSource,
  onRetrySource,
  onUploadFiles,
  project,
  sources,
}: {
  conversations: Doc<"conversations">[] | undefined
  embeddingActionError: string
  embeddingActionPending: boolean
  embeddingConnections: readonly ProjectEmbeddingConnection[] | undefined
  embeddingProfile: ProjectEmbeddingProfile | null | undefined
  onConnectEmbeddingProvider: () => void
  onNewChat: () => void
  onOpenChat: (slug: string) => void
  onPinEmbeddingProvider: (
    connectionId: Id<"providerConnections">
  ) => Promise<void>
  onRemoveSource: (sourceId: Id<"projectSources">) => Promise<void>
  onRetrySource: (sourceId?: Id<"projectSources">) => Promise<void>
  onUploadFiles: (
    files: File[],
    reportProgress: (progress: number) => void
  ) => Promise<void>
  project: Doc<"projects">
  sources: ProjectSourceItem[] | undefined
}) {
  const [activeTab, setActiveTab] = useState("chats")
  const inputId = `project-${project._id}-source-files`
  const remainingFiles =
    sources === undefined
      ? 0
      : Math.min(
          MAX_PROJECT_SOURCE_FILES,
          Math.max(0, MAX_PROJECT_SOURCES - sources.length)
        )
  return (
    <UploadThingDropzone
      disabled={!remainingFiles}
      inputId={inputId}
      maxFiles={remainingFiles}
      maxSize={MAX_PROJECT_SOURCE_BYTES}
      onUpload={async (files, reportProgress) => {
        await onUploadFiles(files, reportProgress)
        setActiveTab("sources")
      }}
    >
      <div className="min-h-0 flex-1 overflow-y-auto">
        <main className="mx-auto w-full max-w-5xl px-5 py-6 md:px-7 md:py-8">
          <header className="mb-6 flex items-center gap-2.5">
            <Folder aria-hidden="true" className="size-6 stroke-[1.6]" />
            <h1 className="font-heading text-xl font-semibold tracking-tight md:text-2xl">
              {project.name}
            </h1>
          </header>

          <button
            className="mb-6 flex min-h-12 w-full items-center gap-3 rounded-xl border bg-card px-4 text-left shadow-sm transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            onClick={onNewChat}
            type="button"
          >
            <HugeiconsIcon
              aria-hidden="true"
              className="size-5 shrink-0 text-muted-foreground"
              icon={Add01Icon}
              strokeWidth={2}
            />
            <span className="text-body text-muted-foreground">
              New chat in {project.name}
            </span>
          </button>

          <Tabs onValueChange={setActiveTab} value={activeTab}>
            <div className="mb-5 flex items-center justify-between gap-3">
              <TabsList className="h-8 gap-1.5 bg-transparent p-0">
                <TabsTrigger
                  className="h-8 flex-none rounded-lg px-3 data-active:border-border! data-active:bg-card data-active:shadow-sm"
                  value="chats"
                >
                  Chats
                </TabsTrigger>
                <TabsTrigger
                  className="h-8 flex-none rounded-lg px-3 data-active:border-border! data-active:bg-card data-active:shadow-sm"
                  value="sources"
                >
                  Sources
                </TabsTrigger>
              </TabsList>
              <Button
                disabled={!remainingFiles}
                onClick={() => document.getElementById(inputId)?.click()}
                size="sm"
                type="button"
                variant="outline"
              >
                <HugeiconsIcon
                  aria-hidden="true"
                  icon={Upload04Icon}
                  strokeWidth={1.8}
                />
                {remainingFiles ? "Add files" : "Source limit reached"}
              </Button>
            </div>
            <TabsContent value="chats">
              {conversations === undefined ? (
                <ChatStatus loading message="Loading project chats..." />
              ) : conversations.length === 0 ? (
                <Empty className="min-h-56 border-0">
                  <EmptyHeader>
                    <EmptyTitle>No chats yet</EmptyTitle>
                    <EmptyDescription>
                      Start the first conversation in this project.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <div className="divide-y">
                  {conversations.map((conversation) => (
                    <button
                      className="group flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-accent/60 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
                      key={conversation._id}
                      onClick={() => onOpenChat(conversation._id)}
                      type="button"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">
                          {conversation.title}
                        </span>
                        <span className="mt-0.5 block truncate text-body text-muted-foreground">
                          Continue this conversation
                        </span>
                      </span>
                      <time
                        className="shrink-0 text-xs text-muted-foreground"
                        dateTime={new Date(
                          conversation.updatedAt
                        ).toISOString()}
                      >
                        {formatProjectDate(conversation.updatedAt)}
                      </time>
                    </button>
                  ))}
                </div>
              )}
            </TabsContent>
            <TabsContent value="sources">
              {sources === undefined ? (
                <ChatStatus loading message="Loading project sources..." />
              ) : (
                <ProjectSourcesPanel
                  actionError={embeddingActionError}
                  actionPending={embeddingActionPending}
                  connections={embeddingConnections}
                  onConnectProvider={onConnectEmbeddingProvider}
                  onPinProvider={onPinEmbeddingProvider}
                  onRemoveSource={onRemoveSource}
                  onRetryIndexing={onRetrySource}
                  profile={embeddingProfile}
                  sources={sources}
                />
              )}
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </UploadThingDropzone>
  )
}

type MessageAreaProps = {
  actionsDisabled: boolean
  conversationId: Id<"conversations"> | undefined
  messages: ChatMessage[] | undefined
  name: string | null | undefined
  onAction: (value: string) => void
  onManageMemory: () => void
  targetMessageId?: string
  userMessageBubbleColor: UserMessageBubbleColor | undefined
}

type LoadedMessageAreaProps = Omit<MessageAreaProps, "messages"> & {
  messages: ChatMessage[]
}

type ResponseMemorySource = {
  memoryItemId?: Id<"memoryItems">
  referenceId: Id<"responseMemoryReferences">
}

export function MessageArea(props: MessageAreaProps) {
  if (props.messages === undefined)
    return <ChatStatus loading message="Loading messages..." />
  if (props.messages.length === 0)
    return (
      <Empty className="chat-empty-state border-0">
        <EmptyHeader className="gap-3">
          <EmptyMedia
            className="bg-primary/10 text-primary ring-1 ring-primary/15"
            variant="icon"
          >
            <HugeiconsIcon
              aria-hidden="true"
              icon={AiBrain01Icon}
              strokeWidth={1.8}
            />
          </EmptyMedia>
          <EmptyTitle className="text-balance">
            {props.name ? `Welcome back, ${props.name}.` : "Welcome back."}
          </EmptyTitle>
          <EmptyDescription className="max-w-xs text-pretty">
            Choose a model, then describe the outcome you want. You can attach
            files from the composer when context matters.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )

  const loadedProps = { ...props, messages: props.messages }
  return (
    <OptionalChatFeatureBoundary
      fallback={<MessageAreaContent {...loadedProps} />}
      key={props.conversationId}
    >
      <MessageAreaWithResponseSources {...loadedProps} />
    </OptionalChatFeatureBoundary>
  )
}

function MessageAreaWithResponseSources(props: LoadedMessageAreaProps) {
  const conversationResponseSources = useQuery(
    api.memories.listConversationResponseSources,
    props.conversationId ? { conversationId: props.conversationId } : "skip"
  )
  const responseSourcesByMessageId = useMemo(
    () =>
      new Map(
        (conversationResponseSources ?? []).map(
          ({ responseMessageId, sources }) => [responseMessageId, sources]
        )
      ),
    [conversationResponseSources]
  )

  return (
    <MessageAreaContent
      {...props}
      responseSourcesByMessageId={responseSourcesByMessageId}
    />
  )
}

function MessageAreaContent({
  actionsDisabled,
  messages,
  onAction,
  onManageMemory,
  responseSourcesByMessageId,
  targetMessageId,
  userMessageBubbleColor,
}: LoadedMessageAreaProps & {
  responseSourcesByMessageId?: ReadonlyMap<
    Id<"messages">,
    ResponseMemorySource[]
  >
}) {
  const consumedTargetMessageId = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (!targetMessageId) {
      consumedTargetMessageId.current = undefined
      return
    }
    if (consumedTargetMessageId.current === targetMessageId) return
    const target = document.getElementById(`message-${targetMessageId}`)
    if (!target) return
    consumedTargetMessageId.current = targetMessageId
    target.scrollIntoView({ behavior: "smooth", block: "center" })
    target.focus({ preventScroll: true })
  }, [messages, targetMessageId])

  return (
    <MessageScrollerProvider>
      <MessageScroller>
        <MessageScrollerViewport>
          <MessageScrollerContent className="chat-message-stream mx-auto w-full max-w-3xl px-4 py-5 sm:px-5 sm:py-6">
            <MessageGroup className="gap-5 sm:gap-6">
              {messages.map((message) => {
                const isUser = message.role === "user"
                const isStreaming = message.status === "streaming"
                const hasReasoning = Boolean(message.reasoningSteps?.length)
                const hasTerminalRuns = Boolean(message.terminalRuns?.length)
                const hasUi = Boolean(message.uiPayload)
                const generatedImage =
                  !isUser && message.outputMode === "image"
                    ? message.attachments.find((attachment) =>
                        attachment.contentType.startsWith("image/")
                      )
                    : undefined
                const remainingAttachments = generatedImage
                  ? message.attachments.filter(
                      (attachment) => attachment !== generatedImage
                    )
                  : message.attachments
                return (
                  <MessageScrollerItem
                    className="focus-visible:rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
                    id={`message-${message._id}`}
                    key={message._id}
                    tabIndex={-1}
                  >
                    <Message align={isUser ? "end" : "start"}>
                      <MessageContent>
                        <Bubble
                          align={isUser ? "end" : "start"}
                          variant={isUser ? "default" : "ghost"}
                        >
                          <BubbleContent
                            className={
                              isUser
                                ? getUserMessageBubbleColorClassName(
                                    userMessageBubbleColor
                                  )
                                : "w-full max-w-2xl"
                            }
                          >
                            {!isUser && message.terminalRuns?.length ? (
                              <div className="mb-3 space-y-2">
                                {message.terminalRuns.map((run) => {
                                  const status =
                                    run.status === "running"
                                      ? ""
                                      : run.status === "complete"
                                        ? `\n[exit ${run.exitCode ?? 0}${
                                            run.durationMs === undefined
                                              ? ""
                                              : ` · ${run.durationMs}ms`
                                          }]`
                                        : `\n[failed${
                                            run.exitCode === undefined
                                              ? ""
                                              : ` · exit ${run.exitCode}`
                                          }]`
                                  const output = [
                                    `${run.workingDirectory ?? "/workspace"} $ ${run.command}`,
                                    run.stdout?.trimEnd(),
                                    run.stderr?.trimEnd(),
                                    status,
                                  ]
                                    .filter(Boolean)
                                    .join("\n")
                                  return (
                                    <Suspense
                                      fallback={
                                        <div
                                          aria-hidden="true"
                                          className="h-24 animate-pulse rounded-lg bg-muted"
                                        />
                                      }
                                      key={run.toolCallId}
                                    >
                                      <Terminal
                                        aria-label="Terminal command"
                                        isStreaming={run.status === "running"}
                                        output={output}
                                      />
                                    </Suspense>
                                  )
                                })}
                              </div>
                            ) : null}
                            {!isUser &&
                            message.outputMode === "image" &&
                            message.status !== "failed" ? (
                              <ImageGeneration
                                completed={
                                  message.status === "complete" &&
                                  Boolean(generatedImage)
                                }
                              >
                                {generatedImage ? (
                                  <a
                                    aria-label="Open generated image"
                                    className="block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                                    href={generatedImage.url}
                                    rel="noreferrer"
                                    target="_blank"
                                  >
                                    <img
                                      alt="AI-generated image"
                                      className="max-h-[32rem] w-full object-contain outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
                                      loading="lazy"
                                      src={generatedImage.url}
                                    />
                                  </a>
                                ) : (
                                  <div
                                    aria-hidden="true"
                                    className="aspect-square w-full bg-muted/40"
                                  />
                                )}
                              </ImageGeneration>
                            ) : message.status === "pending" ||
                              (isStreaming &&
                                !message.content &&
                                !hasReasoning &&
                                !hasTerminalRuns &&
                                !hasUi) ? (
                              <div
                                aria-label="Thinking"
                                className="text-sm text-muted-foreground"
                                role="status"
                              >
                                <TextShimmer
                                  as="span"
                                  baseColor="var(--muted-foreground)"
                                  duration={2}
                                  shimmerColor="var(--foreground)"
                                >
                                  Thinking
                                </TextShimmer>
                              </div>
                            ) : message.status === "failed" ? (
                              message.errorCode === "insufficient_credits" ? (
                                <span className="block space-y-2">
                                  <span className="block">
                                    {message.provider === "fal"
                                      ? "Fal rejected this request because the account or API key has insufficient credit."
                                      : "OpenRouter rejected this request because the account or API key has insufficient credit."}
                                  </span>
                                  <a
                                    className="inline-flex font-medium underline underline-offset-2"
                                    href={
                                      message.provider === "fal"
                                        ? "https://fal.ai/dashboard/billing"
                                        : "https://openrouter.ai/settings/credits"
                                    }
                                    rel="noreferrer"
                                    target="_blank"
                                  >
                                    {message.provider === "fal"
                                      ? "Add Fal credits"
                                      : "Add OpenRouter credits"}
                                  </a>
                                </span>
                              ) : message.provider === "codex" ? (
                                message.content ||
                                "Codex could not complete this response."
                              ) : message.provider === "openai" ? (
                                "OpenAI could not complete this response."
                              ) : message.provider === "fal" ? (
                                "Fal could not complete this response."
                              ) : (
                                "OpenRouter could not complete this response."
                              )
                            ) : isUser ? (
                              <span className="whitespace-pre-wrap">
                                {message.content}
                              </span>
                            ) : (
                              <div className="space-y-3">
                                {message.reasoningSteps?.length ? (
                                  <ReasoningSteps className="max-w-full border">
                                    <ReasoningStepsTrigger />
                                    <ReasoningStepsContent>
                                      {message.reasoningSteps.map(
                                        (step, index) => (
                                          <ReasoningStep
                                            id={`${message._id}-${index}`}
                                            key={`${message._id}-${index}`}
                                            label={step}
                                            status={
                                              isStreaming &&
                                              index ===
                                                message.reasoningSteps!.length -
                                                  1
                                                ? "active"
                                                : "done"
                                            }
                                          />
                                        )
                                      )}
                                    </ReasoningStepsContent>
                                  </ReasoningSteps>
                                ) : null}
                                {message.content ? (
                                  <Suspense
                                    fallback={
                                      <div
                                        aria-hidden="true"
                                        className="h-5 w-32 animate-pulse rounded bg-muted"
                                      />
                                    }
                                  >
                                    <MessageResponse
                                      animated
                                      isAnimating={isStreaming}
                                    >
                                      {message.content}
                                    </MessageResponse>
                                  </Suspense>
                                ) : null}
                                {message.uiPayload ? (
                                  <Suspense fallback={null}>
                                    <GenerativeUi
                                      disabled={actionsDisabled}
                                      onAction={onAction}
                                      payload={message.uiPayload}
                                    />
                                  </Suspense>
                                ) : null}
                              </div>
                            )}
                            {!isUser && message.status === "complete" ? (
                              <OptionalChatFeatureBoundary>
                                <MemoryUsed
                                  onManageMemory={onManageMemory}
                                  sources={responseSourcesByMessageId?.get(
                                    message._id
                                  )}
                                />
                              </OptionalChatFeatureBoundary>
                            ) : null}
                            {remainingAttachments.length ? (
                              <AttachmentGroup className="mt-2 max-w-full">
                                {remainingAttachments.map((attachment) => {
                                  const isImage =
                                    attachment.contentType.startsWith("image/")
                                  return (
                                    <Attachment
                                      key={attachment.storageId}
                                      size="sm"
                                    >
                                      <AttachmentMedia
                                        variant={isImage ? "image" : "icon"}
                                      >
                                        {isImage ? (
                                          <img alt="" src={attachment.url} />
                                        ) : (
                                          <FileText aria-hidden="true" />
                                        )}
                                      </AttachmentMedia>
                                      <AttachmentContent className="max-w-44">
                                        <AttachmentTitle>
                                          {attachment.name}
                                        </AttachmentTitle>
                                        <AttachmentDescription>
                                          {formatFileSize(attachment.size)}
                                        </AttachmentDescription>
                                      </AttachmentContent>
                                      <AttachmentTrigger
                                        aria-label={`Open ${attachment.name}`}
                                        render={
                                          <a
                                            href={attachment.url}
                                            rel="noreferrer"
                                            target="_blank"
                                          />
                                        }
                                      />
                                    </Attachment>
                                  )
                                })}
                              </AttachmentGroup>
                            ) : null}
                          </BubbleContent>
                        </Bubble>
                      </MessageContent>
                    </Message>
                  </MessageScrollerItem>
                )
              })}
            </MessageGroup>
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton />
      </MessageScroller>
    </MessageScrollerProvider>
  )
}

function MemoryUsed({
  onManageMemory,
  sources,
}: {
  onManageMemory: () => void
  sources: ResponseMemorySource[] | undefined
}) {
  const feedback = useMutation(api.memories.submitFeedback)
  const [open, setOpen] = useState(false)
  if (!sources?.length) return null
  return (
    <div className="mt-3 border-t pt-2">
      <Button
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        size="sm"
        variant="outline"
      >
        Memory used ({sources.length})
      </Button>
      {open ? (
        <div className="mt-2 space-y-2 text-xs" aria-label="Memory sources">
          <Button onClick={onManageMemory} size="sm" variant="ghost">
            Correct or manage memory
          </Button>
          {sources.map((source) => (
            <div
              className="flex flex-wrap items-center gap-2"
              key={source.referenceId}
            >
              <span>
                {source.memoryItemId ? "Saved memory" : "History summary"}
              </span>
              <Button
                onClick={() =>
                  void feedback({
                    feedback: "helpful",
                    referenceId: source.referenceId,
                  })
                }
                size="sm"
                variant="ghost"
              >
                Helpful
              </Button>
              <Button
                onClick={() =>
                  void feedback({
                    feedback: "incorrect",
                    referenceId: source.referenceId,
                  })
                }
                size="sm"
                variant="ghost"
              >
                Incorrect
              </Button>
              <Button
                onClick={() =>
                  void feedback({
                    feedback: "dont_use",
                    referenceId: source.referenceId,
                  })
                }
                size="sm"
                variant="ghost"
              >
                Don’t use this again
              </Button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function ChatStatus({
  loading = false,
  message,
}: {
  loading?: boolean
  message: string
}) {
  return (
    <div
      aria-live="polite"
      className="chat-status grid flex-1 place-items-center p-6 text-sm text-muted-foreground"
      role="status"
    >
      <span className="inline-flex items-center gap-2.5 rounded-full border border-border/70 bg-card/75 px-4 py-2 shadow-sm">
        {loading ? <Spinner aria-hidden="true" className="size-3.5" /> : null}
        {message}
      </span>
    </div>
  )
}
