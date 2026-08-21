"use client"

import { CheckIcon, Code2Icon, CopyIcon } from "lucide-react"
import type { ComponentProps, CSSProperties, HTMLAttributes } from "react"
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
import type {
  BundledLanguage,
  BundledTheme,
  HighlighterGeneric,
  ThemedToken,
} from "shiki"
import { bundledLanguagesInfo, createHighlighter } from "shiki"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type CodeBlockProps = HTMLAttributes<HTMLDivElement> & {
  code: string
  highlight?: boolean
  language: string
  showLineNumbers?: boolean
}

type HighlightLanguage = BundledLanguage | "text"

type TokenizedCode = {
  background: string
  darkBackground: string
  darkForeground: string
  foreground: string
  highlighted: boolean
  tokens: ThemedToken[][]
}

type KeyedToken = {
  key: string
  token: ThemedToken
}

type KeyedLine = {
  key: string
  tokens: KeyedToken[]
}

type ShikiRootStyle = CSSProperties & {
  "--shiki-dark": string
  "--shiki-dark-bg": string
}

const MAX_TOKEN_CACHE_ENTRIES = 100

const CodeBlockContext = createContext({ code: "" })

let highlighterPromise:
  Promise<HighlighterGeneric<BundledLanguage, BundledTheme>> | undefined
const languageLoadCache = new Map<
  BundledLanguage,
  Promise<HighlighterGeneric<BundledLanguage, BundledTheme>>
>()
const tokenCache = new Map<string, TokenizedCode>()

const languageMetadata = new Map<
  string,
  { id: BundledLanguage; name: string }
>()
for (const language of bundledLanguagesInfo) {
  languageMetadata.set(language.id, {
    id: language.id as BundledLanguage,
    name: language.name,
  })
  for (const alias of language.aliases ?? [])
    languageMetadata.set(alias, {
      id: language.id as BundledLanguage,
      name: language.name,
    })
}
languageMetadata.set("python3", { id: "python", name: "Python" })

const normalizeLanguage = (language: string): HighlightLanguage => {
  const normalized = language.trim().toLowerCase()
  return languageMetadata.get(normalized)?.id ?? "text"
}

export const isPythonCodeLanguage = (language: string) =>
  normalizeLanguage(language) === "python"

export const getCodeLanguageLabel = (language: string) => {
  const normalized = language.trim().toLowerCase()
  if (!normalized || normalized === "text" || normalized === "plaintext")
    return "Plain text"

  return languageMetadata.get(normalized)?.name ?? language.trim()
}

const getTokenCacheKey = (code: string, language: HighlightLanguage) =>
  `${language}\u0000${code}`

const cacheTokens = (key: string, value: TokenizedCode) => {
  // Bound retained model output so long chat sessions cannot grow the cache forever.
  if (tokenCache.size >= MAX_TOKEN_CACHE_ENTRIES) {
    const oldestKey = tokenCache.keys().next().value
    if (oldestKey) tokenCache.delete(oldestKey)
  }
  tokenCache.set(key, value)
}

const getHighlighter = (language: BundledLanguage) => {
  const cached = languageLoadCache.get(language)
  if (cached) return cached

  if (!highlighterPromise) {
    const created = createHighlighter({
      langs: [],
      themes: ["github-light", "github-dark"],
    })
    highlighterPromise = created
    void created.catch(() => {
      if (highlighterPromise === created) highlighterPromise = undefined
    })
  }
  const loaded = highlighterPromise.then(async (highlighter) => {
    if (!highlighter.getLoadedLanguages().includes(language))
      await highlighter.loadLanguage(language)
    return highlighter
  })
  languageLoadCache.set(language, loaded)
  void loaded.catch(() => languageLoadCache.delete(language))
  return loaded
}

const createRawTokens = (code: string): TokenizedCode => ({
  background: "transparent",
  darkBackground: "transparent",
  darkForeground: "inherit",
  foreground: "inherit",
  highlighted: false,
  tokens: code.split("\n").map((line) =>
    line
      ? [
          {
            color: "inherit",
            content: line,
          } as ThemedToken,
        ]
      : []
  ),
})

const splitThemeValue = (
  value: string | undefined,
  darkVariable: "--shiki-dark" | "--shiki-dark-bg",
  fallback: string
) => {
  if (!value) return { dark: fallback, light: fallback }

  const marker = `;${darkVariable}:`
  const markerIndex = value.indexOf(marker)
  if (markerIndex === -1) return { dark: value, light: value }

  return {
    dark: value.slice(markerIndex + marker.length),
    light: value.slice(0, markerIndex),
  }
}

const highlightCode = async (
  code: string,
  language: BundledLanguage
): Promise<TokenizedCode> => {
  const highlighter = await getHighlighter(language)
  const result = highlighter.codeToTokens(code, {
    lang: language,
    themes: {
      dark: "github-dark",
      light: "github-light",
    },
  })
  const background = splitThemeValue(
    result.bg,
    "--shiki-dark-bg",
    "transparent"
  )
  const foreground = splitThemeValue(result.fg, "--shiki-dark", "inherit")

  return {
    background: background.light,
    darkBackground: background.dark,
    darkForeground: foreground.dark,
    foreground: foreground.light,
    highlighted: true,
    tokens: result.tokens,
  }
}

const addKeysToTokens = (lines: ThemedToken[][]): KeyedLine[] =>
  lines.map((line, lineIndex) => ({
    key: `line-${lineIndex}`,
    tokens: line.map((token, tokenIndex) => ({
      key: `line-${lineIndex}-token-${tokenIndex}`,
      token,
    })),
  }))

// Shiki encodes text styles as bit flags: italic=1, bold=2, underline=4.
const hasFontStyle = (fontStyle: number | undefined, flag: number) =>
  Boolean(fontStyle && fontStyle & flag)

const TokenSpan = ({ token }: { token: ThemedToken }) => (
  <span
    className="dark:!bg-(--shiki-dark-bg) dark:!text-(--shiki-dark)"
    style={{
      backgroundColor: token.bgColor,
      color: token.color,
      fontStyle: hasFontStyle(token.fontStyle, 1) ? "italic" : undefined,
      fontWeight: hasFontStyle(token.fontStyle, 2) ? "bold" : undefined,
      textDecoration: hasFontStyle(token.fontStyle, 4)
        ? "underline"
        : undefined,
      ...token.htmlStyle,
    }}
  >
    {token.content}
  </span>
)

const CodeLine = ({
  line,
  showLineNumbers,
}: {
  line: KeyedLine
  showLineNumbers: boolean
}) => (
  <span
    className={cn(
      "block",
      showLineNumbers &&
        "before:mr-4 before:inline-block before:w-8 before:text-right before:font-mono before:text-muted-foreground/50 before:content-[counter(line)] before:select-none before:[counter-increment:line]"
    )}
  >
    {line.tokens.length
      ? line.tokens.map(({ key, token }) => (
          <TokenSpan key={key} token={token} />
        ))
      : "\n"}
  </span>
)

const CodeBlockBody = memo(
  ({
    showLineNumbers,
    tokenized,
  }: {
    showLineNumbers: boolean
    tokenized: TokenizedCode
  }) => {
    const lines = useMemo(
      () => addKeysToTokens(tokenized.tokens),
      [tokenized.tokens]
    )
    const style = useMemo<ShikiRootStyle>(
      () => ({
        "--shiki-dark": tokenized.darkForeground,
        "--shiki-dark-bg": tokenized.darkBackground,
        backgroundColor: tokenized.background,
        color: tokenized.foreground,
      }),
      [
        tokenized.background,
        tokenized.darkBackground,
        tokenized.darkForeground,
        tokenized.foreground,
      ]
    )

    return (
      <pre
        className="m-0 w-max min-w-full p-4 text-[0.8125rem] leading-6 sm:p-5 sm:text-sm dark:!bg-(--shiki-dark-bg) dark:!text-(--shiki-dark)"
        style={style}
      >
        <code
          className={cn(
            "font-mono",
            showLineNumbers && "[counter-increment:line_0] [counter-reset:line]"
          )}
        >
          {lines.map((line) => (
            <CodeLine
              key={line.key}
              line={line}
              showLineNumbers={showLineNumbers}
            />
          ))}
        </code>
      </pre>
    )
  }
)

CodeBlockBody.displayName = "CodeBlockBody"

const CodeBlockContent = ({
  code,
  highlight,
  language,
  showLineNumbers,
}: {
  code: string
  highlight: boolean
  language: string
  showLineNumbers: boolean
}) => {
  const highlightLanguage = normalizeLanguage(language)
  const cacheKey = getTokenCacheKey(code, highlightLanguage)
  const rawTokens = useMemo(() => createRawTokens(code), [code])
  const [tokenized, setTokenized] = useState<TokenizedCode>(
    () => tokenCache.get(cacheKey) ?? rawTokens
  )

  useEffect(() => {
    if (!highlight) {
      setTokenized(rawTokens)
      return
    }

    const cached = tokenCache.get(cacheKey)
    if (cached) {
      setTokenized(cached)
      return
    }

    setTokenized(rawTokens)
    if (highlightLanguage === "text") return

    let cancelled = false
    void highlightCode(code, highlightLanguage)
      .then((result) => {
        cacheTokens(cacheKey, result)
        if (!cancelled) setTokenized(result)
      })
      .catch(() => {
        if (!cancelled) setTokenized(rawTokens)
      })

    return () => {
      cancelled = true
    }
  }, [cacheKey, code, highlight, highlightLanguage, rawTokens])

  return (
    <div
      className="relative overflow-x-auto overscroll-x-contain"
      data-highlighted={tokenized.highlighted ? "true" : "false"}
    >
      <CodeBlockBody showLineNumbers={showLineNumbers} tokenized={tokenized} />
    </div>
  )
}

export const CodeBlockHeader = ({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex min-h-12 items-center justify-between gap-3 border-b border-border/60 bg-muted/65 px-3.5 py-2 text-sm text-muted-foreground sm:px-4",
      className
    )}
    {...props}
  />
)

export const CodeBlockLanguage = ({
  className,
  language,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { language: string }) => (
  <span
    className={cn(
      "flex min-w-0 items-center gap-2 font-semibold text-foreground",
      className
    )}
    {...props}
  >
    <Code2Icon aria-hidden="true" className="size-4 shrink-0" strokeWidth={2} />
    <span className="truncate">{getCodeLanguageLabel(language)}</span>
  </span>
)

export const CodeBlockActions = ({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex shrink-0 items-center gap-1", className)}
    {...props}
  />
)

export const CodeBlock = ({
  children,
  className,
  code,
  highlight = true,
  language,
  showLineNumbers = false,
  style,
  ...props
}: CodeBlockProps) => {
  const context = useMemo(() => ({ code }), [code])

  return (
    <CodeBlockContext.Provider value={context}>
      <div
        className={cn(
          "group my-4 w-full overflow-hidden rounded-2xl border border-border/70 bg-card text-foreground shadow-[0_10px_30px_-24px_rgb(0_0_0/0.45)]",
          className
        )}
        data-language={language}
        style={{
          containIntrinsicSize: "auto 200px",
          contentVisibility: "auto",
          ...style,
        }}
        {...props}
      >
        {children}
        <CodeBlockContent
          code={code}
          highlight={highlight}
          language={language}
          showLineNumbers={showLineNumbers}
        />
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
  "aria-label": ariaLabel = "Copy code",
  children,
  className,
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
      window.clearTimeout(timeoutRef.current)
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

  return (
    <Button
      aria-label={copied ? "Code copied" : ariaLabel}
      className={cn("relative", className)}
      data-state={copied ? "copied" : "idle"}
      onClick={copy}
      type="button"
      variant="ghost"
      {...props}
    >
      {children ?? (
        <span aria-hidden="true" className="relative size-4">
          <CopyIcon
            className={cn(
              "absolute inset-0 size-4 transition-[opacity,scale,filter] duration-150 motion-reduce:transform-none motion-reduce:transition-none",
              copied
                ? "scale-25 opacity-0 blur-[4px]"
                : "scale-100 opacity-100 blur-none"
            )}
          />
          <CheckIcon
            className={cn(
              "absolute inset-0 size-4 transition-[opacity,scale,filter] duration-150 motion-reduce:transform-none motion-reduce:transition-none",
              copied
                ? "scale-100 opacity-100 blur-none"
                : "scale-25 opacity-0 blur-[4px]"
            )}
          />
        </span>
      )}
      <span aria-live="polite" className="sr-only">
        {copied ? "Code copied to clipboard" : ""}
      </span>
    </Button>
  )
}
