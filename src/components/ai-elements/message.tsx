"use client"

import { Button } from "@/components/ui/button"
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockHeader,
  CodeBlockLanguage,
  isPythonCodeLanguage,
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
import { normalizeMarkdownMath } from "@/lib/markdown-math"
import { createMathPlugin } from "@streamdown/math"
import { PlayIcon, SquareIcon } from "lucide-react"
import type { ComponentProps, HTMLAttributes } from "react"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
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
      "is-user:dark flex w-fit max-w-full min-w-0 flex-col gap-1.5 overflow-hidden text-body",
      "group-[.is-user]:ml-auto group-[.is-user]:text-foreground",
      "group-[.is-assistant]:text-foreground",
      className
    )}
    {...props}
  >
    {children}
  </div>
)

export * from "./message-controls"

export type MessageResponseProps = ComponentProps<typeof Streamdown>

type MarkdownCodeProps = ComponentProps<"code"> & { node?: unknown }

const BrowserPythonCodeBlock = ({
  code,
  highlight,
  language,
}: {
  code: string
  highlight: boolean
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
      <CodeBlock
        className="my-0"
        code={code}
        highlight={highlight}
        language={language}
      >
        <CodeBlockHeader>
          <CodeBlockLanguage language={language} />
          <CodeBlockActions>
            <CodeBlockCopyButton aria-label="Copy code" size="icon-lg" />
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

const createMarkdownComponents = (highlight: boolean): Components => ({
  code: ({ children, className, node: _node }: MarkdownCodeProps) => {
    const language = className?.replace(/^language-/, "") || "text"
    const value = String(children).replace(/\n$/, "")

    if (isPythonCodeLanguage(language))
      return (
        <BrowserPythonCodeBlock
          code={value}
          highlight={highlight}
          language={language}
        />
      )

    return (
      <CodeBlock code={value} highlight={highlight} language={language}>
        <CodeBlockHeader>
          <CodeBlockLanguage language={language} />
          <CodeBlockActions>
            <CodeBlockCopyButton aria-label="Copy code" size="icon-lg" />
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
})

const markdownPlugins = {
  math: createMathPlugin({ singleDollarTextMath: true }),
}

const MessageResponseComponent = ({
  children,
  className,
  isAnimating,
  ...props
}: MessageResponseProps) => {
  const components = useMemo(
    () => createMarkdownComponents(!isAnimating),
    [isAnimating]
  )

  return (
    <Streamdown
      className={cn(
        "markdown-response size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        className
      )}
      components={components}
      isAnimating={isAnimating}
      plugins={markdownPlugins}
      {...props}
    >
      {normalizeMarkdownMath(children ?? "")}
    </Streamdown>
  )
}

export const MessageResponse = memo(
  MessageResponseComponent,
  (prevProps, nextProps) =>
    prevProps.children === nextProps.children &&
    nextProps.isAnimating === prevProps.isAnimating
)

MessageResponse.displayName = "MessageResponse"
