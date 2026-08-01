"use client"

import { Button } from "@/components/ui/button"
import { ButtonGroup, ButtonGroupText } from "@/components/ui/button-group"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockHeader,
} from "@/components/ai-elements/code-block"
import {
  Terminal,
  TerminalActions,
  TerminalContent,
  TerminalCopyButton,
  TerminalHeader,
  TerminalStatus,
  TerminalTitle,
} from "@/components/ai-elements/terminal"
import { cn } from "@/lib/utils"
import { executeBrowserPython } from "@/lib/browser-python"
import { createMathPlugin } from "@streamdown/math"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PlayIcon,
  SquareIcon,
} from "lucide-react"
import type { ComponentProps, HTMLAttributes, ReactElement } from "react"
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { Streamdown } from "streamdown"
import type { Components } from "streamdown"

export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  from: "assistant" | "system" | "user"
}

export const Message = ({ className, from, ...props }: MessageProps) => (
  <div
    className={cn(
      "group flex w-full max-w-[95%] flex-col gap-2",
      from === "user" ? "is-user ml-auto justify-end" : "is-assistant",
      className
    )}
    {...props}
  />
)

export type MessageContentProps = HTMLAttributes<HTMLDivElement>

export const MessageContent = ({
  children,
  className,
  ...props
}: MessageContentProps) => (
  <div
    className={cn(
      "is-user:dark flex w-fit max-w-full min-w-0 flex-col gap-2 overflow-hidden text-sm",
      "group-[.is-user]:ml-auto group-[.is-user]:rounded-lg group-[.is-user]:bg-secondary group-[.is-user]:px-4 group-[.is-user]:py-3 group-[.is-user]:text-foreground",
      "group-[.is-assistant]:text-foreground",
      className
    )}
    {...props}
  >
    {children}
  </div>
)

export type MessageActionsProps = ComponentProps<"div">

export const MessageActions = ({
  className,
  children,
  ...props
}: MessageActionsProps) => (
  <div className={cn("flex items-center gap-1", className)} {...props}>
    {children}
  </div>
)

export type MessageActionProps = ComponentProps<typeof Button> & {
  tooltip?: string
  label?: string
}

export const MessageAction = ({
  tooltip,
  children,
  label,
  variant = "ghost",
  size = "icon-sm",
  ...props
}: MessageActionProps) => {
  const button = (
    <Button size={size} type="button" variant={variant} {...props}>
      {children}
      <span className="sr-only">{label || tooltip}</span>
    </Button>
  )

  if (tooltip) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>{button}</TooltipTrigger>
          <TooltipContent>
            <p>{tooltip}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return button
}

interface MessageBranchContextType {
  currentBranch: number
  totalBranches: number
  goToPrevious: () => void
  goToNext: () => void
  branches: ReactElement[]
  setBranches: (branches: ReactElement[]) => void
}

const MessageBranchContext = createContext<MessageBranchContextType | null>(
  null
)

const useMessageBranch = () => {
  const context = useContext(MessageBranchContext)

  if (!context) {
    throw new Error(
      "MessageBranch components must be used within MessageBranch"
    )
  }

  return context
}

export type MessageBranchProps = HTMLAttributes<HTMLDivElement> & {
  defaultBranch?: number
  onBranchChange?: (branchIndex: number) => void
}

export const MessageBranch = ({
  defaultBranch = 0,
  onBranchChange,
  className,
  ...props
}: MessageBranchProps) => {
  const [currentBranch, setCurrentBranch] = useState(defaultBranch)
  const [branches, setBranches] = useState<ReactElement[]>([])

  const handleBranchChange = useCallback(
    (newBranch: number) => {
      setCurrentBranch(newBranch)
      onBranchChange?.(newBranch)
    },
    [onBranchChange]
  )

  const goToPrevious = useCallback(() => {
    const newBranch =
      currentBranch > 0 ? currentBranch - 1 : branches.length - 1
    handleBranchChange(newBranch)
  }, [currentBranch, branches.length, handleBranchChange])

  const goToNext = useCallback(() => {
    const newBranch =
      currentBranch < branches.length - 1 ? currentBranch + 1 : 0
    handleBranchChange(newBranch)
  }, [currentBranch, branches.length, handleBranchChange])

  const contextValue = useMemo<MessageBranchContextType>(
    () => ({
      branches,
      currentBranch,
      goToNext,
      goToPrevious,
      setBranches,
      totalBranches: branches.length,
    }),
    [branches, currentBranch, goToNext, goToPrevious]
  )

  return (
    <MessageBranchContext.Provider value={contextValue}>
      <div
        className={cn("grid w-full gap-2 [&>div]:pb-0", className)}
        {...props}
      />
    </MessageBranchContext.Provider>
  )
}

export type MessageBranchContentProps = HTMLAttributes<HTMLDivElement>

export const MessageBranchContent = ({
  children,
  ...props
}: MessageBranchContentProps) => {
  const { currentBranch, setBranches, branches } = useMessageBranch()
  const childrenArray = useMemo(
    () => (Array.isArray(children) ? children : [children]),
    [children]
  )

  // Use useEffect to update branches when they change
  useEffect(() => {
    if (branches.length !== childrenArray.length) {
      setBranches(childrenArray)
    }
  }, [childrenArray, branches, setBranches])

  return childrenArray.map((branch, index) => (
    <div
      className={cn(
        "grid gap-2 overflow-hidden [&>div]:pb-0",
        index === currentBranch ? "block" : "hidden"
      )}
      key={branch.key}
      {...props}
    >
      {branch}
    </div>
  ))
}

export type MessageBranchSelectorProps = ComponentProps<typeof ButtonGroup>

export const MessageBranchSelector = ({
  className,
  ...props
}: MessageBranchSelectorProps) => {
  const { totalBranches } = useMessageBranch()

  // Don't render if there's only one branch
  if (totalBranches <= 1) {
    return null
  }

  return (
    <ButtonGroup
      className={cn(
        "[&>*:not(:first-child)]:rounded-l-md [&>*:not(:last-child)]:rounded-r-md",
        className
      )}
      orientation="horizontal"
      {...props}
    />
  )
}

export type MessageBranchPreviousProps = ComponentProps<typeof Button>

export const MessageBranchPrevious = ({
  children,
  ...props
}: MessageBranchPreviousProps) => {
  const { goToPrevious, totalBranches } = useMessageBranch()

  return (
    <Button
      aria-label="Previous branch"
      disabled={totalBranches <= 1}
      onClick={goToPrevious}
      size="icon-sm"
      type="button"
      variant="ghost"
      {...props}
    >
      {children ?? <ChevronLeftIcon size={14} />}
    </Button>
  )
}

export type MessageBranchNextProps = ComponentProps<typeof Button>

export const MessageBranchNext = ({
  children,
  ...props
}: MessageBranchNextProps) => {
  const { goToNext, totalBranches } = useMessageBranch()

  return (
    <Button
      aria-label="Next branch"
      disabled={totalBranches <= 1}
      onClick={goToNext}
      size="icon-sm"
      type="button"
      variant="ghost"
      {...props}
    >
      {children ?? <ChevronRightIcon size={14} />}
    </Button>
  )
}

export type MessageBranchPageProps = HTMLAttributes<HTMLSpanElement>

export const MessageBranchPage = ({
  className,
  ...props
}: MessageBranchPageProps) => {
  const { currentBranch, totalBranches } = useMessageBranch()

  return (
    <ButtonGroupText
      className={cn(
        "border-none bg-transparent text-muted-foreground shadow-none",
        className
      )}
      {...props}
    >
      {currentBranch + 1} of {totalBranches}
    </ButtonGroupText>
  )
}

export type MessageResponseProps = ComponentProps<typeof Streamdown>

type MarkdownCodeProps = ComponentProps<"code"> & { node?: unknown }

const PYTHON_LANGUAGES = new Set(["py", "python", "python3"])

const BrowserPythonCodeBlock = ({
  code,
  language,
}: {
  code: string
  language: string
}) => {
  const [isRunning, setIsRunning] = useState(false)
  const [output, setOutput] = useState<string | null>(null)
  const executionRef = useRef<ReturnType<typeof executeBrowserPython> | null>(
    null
  )

  const stop = useCallback(() => {
    executionRef.current?.cancel()
    executionRef.current = null
  }, [])

  const run = useCallback(() => {
    stop()
    setIsRunning(true)
    setOutput("Loading Python 3.14 in your browser…")
    let execution: ReturnType<typeof executeBrowserPython>
    try {
      execution = executeBrowserPython(code)
    } catch (cause) {
      setIsRunning(false)
      setOutput(cause instanceof Error ? cause.message : "Python could not run")
      return
    }
    executionRef.current = execution
    void execution.result
      .then((result) => {
        if (executionRef.current !== execution) return
        setOutput(
          [result.stdout.trimEnd(), result.stderr.trimEnd(), result.error]
            .filter(Boolean)
            .join("\n") || "Process exited with no output."
        )
      })
      .catch((cause: unknown) => {
        if (executionRef.current !== execution) return
        setOutput(
          cause instanceof DOMException && cause.name === "AbortError"
            ? "Stopped."
            : cause instanceof Error
              ? cause.message
              : "Python could not run"
        )
      })
      .finally(() => {
        if (executionRef.current !== execution) return
        executionRef.current = null
        setIsRunning(false)
      })
  }, [code, stop])

  useEffect(() => stop, [stop])

  return (
    <div className="my-4">
      <CodeBlock className="my-0" code={code} language={language}>
        <CodeBlockHeader>
          <span className="font-mono lowercase">{language}</span>
          <CodeBlockActions>
            <CodeBlockCopyButton aria-label="Copy code" size="icon-sm" />
            <Button
              aria-label={isRunning ? "Stop Python" : "Run Python"}
              onClick={isRunning ? stop : run}
              size="sm"
              type="button"
              variant="ghost"
            >
              {isRunning ? (
                <SquareIcon aria-hidden="true" size={13} />
              ) : (
                <PlayIcon aria-hidden="true" size={13} />
              )}
              {isRunning ? "Stop" : "Run"}
            </Button>
          </CodeBlockActions>
        </CodeBlockHeader>
      </CodeBlock>
      {output !== null ? (
        <Terminal className="mt-2" isStreaming={isRunning} output={output}>
          <TerminalHeader>
            <TerminalTitle>Browser Python</TerminalTitle>
            <TerminalActions>
              <TerminalStatus />
              <TerminalCopyButton aria-label="Copy Python output" />
            </TerminalActions>
          </TerminalHeader>
          <TerminalContent />
        </Terminal>
      ) : null}
    </div>
  )
}

const markdownComponents: Components = {
  code: ({ children, className, node: _node }: MarkdownCodeProps) => {
    const language = className?.replace(/^language-/, "") || "text"
    const value = String(children).replace(/\n$/, "")

    if (PYTHON_LANGUAGES.has(language.toLowerCase()))
      return <BrowserPythonCodeBlock code={value} language={language} />

    return (
      <CodeBlock code={value} language={language}>
        <CodeBlockHeader>
          <span className="font-mono lowercase">{language}</span>
          <CodeBlockActions>
            <CodeBlockCopyButton aria-label="Copy code" size="icon-sm" />
          </CodeBlockActions>
        </CodeBlockHeader>
      </CodeBlock>
    )
  },
  inlineCode: ({ className, node: _node, ...props }: MarkdownCodeProps) => (
    <code
      className={cn(
        "rounded bg-muted px-1.5 py-0.5 font-mono text-sm",
        className
      )}
      {...props}
    />
  ),
}

const markdownPlugins = {
  math: createMathPlugin({ singleDollarTextMath: true }),
}

export const MessageResponse = memo(
  ({ className, ...props }: MessageResponseProps) => (
    <Streamdown
      className={cn(
        "markdown-response size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        className
      )}
      components={markdownComponents}
      plugins={markdownPlugins}
      {...props}
    />
  ),
  (prevProps, nextProps) =>
    prevProps.children === nextProps.children &&
    nextProps.isAnimating === prevProps.isAnimating
)

MessageResponse.displayName = "MessageResponse"

export type MessageToolbarProps = ComponentProps<"div">

export const MessageToolbar = ({
  className,
  children,
  ...props
}: MessageToolbarProps) => (
  <div
    className={cn(
      "mt-4 flex w-full items-center justify-between gap-4",
      className
    )}
    {...props}
  >
    {children}
  </div>
)
