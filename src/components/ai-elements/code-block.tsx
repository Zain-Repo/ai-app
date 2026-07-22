"use client"

import { CheckIcon, CopyIcon } from "lucide-react"
import type { ComponentProps, HTMLAttributes } from "react"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type CodeBlockProps = HTMLAttributes<HTMLDivElement> & {
  code: string
  language: string
  showLineNumbers?: boolean
}

const CodeBlockContext = createContext({ code: "" })

export const CodeBlockHeader = ({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex items-center justify-between border-b bg-muted/80 px-3 py-2 text-xs text-muted-foreground",
      className
    )}
    {...props}
  />
)

export const CodeBlockActions = ({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("-my-1 -mr-1 flex items-center", className)} {...props} />
)

export const CodeBlock = ({
  children,
  className,
  code,
  language,
  showLineNumbers = false,
  ...props
}: CodeBlockProps) => {
  const context = useMemo(() => ({ code }), [code])

  return (
    <CodeBlockContext.Provider value={context}>
      <div
        className={cn(
          "group my-4 w-full overflow-hidden rounded-md border bg-background text-foreground",
          className
        )}
        data-language={language}
        {...props}
      >
        {children}
        <pre className="overflow-x-auto p-4 text-sm">
          <code
            className={cn(
              "font-mono whitespace-pre",
              showLineNumbers &&
                "[counter-increment:line_0] [counter-reset:line] [&>span]:block [&>span]:before:mr-4 [&>span]:before:inline-block [&>span]:before:w-8 [&>span]:before:text-right [&>span]:before:text-muted-foreground/50 [&>span]:before:content-[counter(line)] [&>span]:before:[counter-increment:line]"
            )}
          >
            {showLineNumbers
              ? code
                  .split("\n")
                  .map((line, index) => (
                    <span key={`${index}-${line}`}>{line || "\n"}</span>
                  ))
              : code}
          </code>
        </pre>
      </div>
    </CodeBlockContext.Provider>
  )
}

export type CodeBlockCopyButtonProps = ComponentProps<typeof Button> & {
  onCopy?: () => void
  onError?: (error: Error) => void
  timeout?: number
}

export const CodeBlockCopyButton = ({
  children,
  onCopy,
  onError,
  timeout = 2000,
  ...props
}: CodeBlockCopyButtonProps) => {
  const [copied, setCopied] = useState(false)
  const timeoutRef = useRef<number>(0)
  const { code } = useContext(CodeBlockContext)

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      onCopy?.()
      timeoutRef.current = window.setTimeout(() => setCopied(false), timeout)
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error("Copy failed"))
    }
  }, [code, onCopy, onError, timeout])

  useEffect(
    () => () => {
      window.clearTimeout(timeoutRef.current)
    },
    []
  )

  const Icon = copied ? CheckIcon : CopyIcon
  return (
    <Button onClick={copy} type="button" variant="ghost" {...props}>
      {children ?? <Icon aria-hidden="true" size={14} />}
    </Button>
  )
}
