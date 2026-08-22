"use client"

import * as React from "react"
import { BookOpen, Brain, ExternalLink, FolderOpen, Globe } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { Id } from "../../convex/_generated/dataModel"

export type ResponseSource = {
  referenceId: Id<"responseMemoryReferences">
  sourceType?: "memory" | "web" | "project"
  url?: string
  title?: string
  projectSourceId?: Id<"projectSources">
  memoryItemId?: Id<"memoryItems">
  summaryId?: Id<"conversationMemorySummaries">
  feedback?: "helpful" | "incorrect" | "dont_use"
  createdAt: number
}

interface ResponseSourcesProps {
  className?: string
  sources: ResponseSource[]
}

function inferSourceType(source: ResponseSource): "memory" | "web" | "project" {
  if (source.sourceType) return source.sourceType
  if (source.url) return "web"
  if (source.projectSourceId) return "project"
  return "memory"
}

function sourceLabel(source: ResponseSource): string {
  const type = inferSourceType(source)
  switch (type) {
    case "web":
      return "Web"
    case "project":
      return "Project"
    case "memory":
    default:
      return source.memoryItemId ? "Memory" : "History"
  }
}

function SourceIcon({ type }: { type: "memory" | "web" | "project" }) {
  const className = "size-3.5 shrink-0 text-muted-foreground"
  switch (type) {
    case "web":
      return <Globe className={className} />
    case "project":
      return <FolderOpen className={className} />
    case "memory":
      return <Brain className={className} />
  }
}

function ResponseSources({ className, sources }: ResponseSourcesProps) {
  const [open, setOpen] = React.useState(false)
  if (!sources.length) return null

  return (
    <div className={cn("mt-2", className)} aria-label="Response sources">
      <Button
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        size="icon-sm"
        variant="ghost"
        className="h-auto gap-1.5 px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <BookOpen className="size-3.5" />
        <span>
          {sources.length} {sources.length === 1 ? "source" : "sources"}
        </span>
      </Button>
      {open ? (
        <ul className="mt-1.5 space-y-1" aria-label="Source list">
          {sources.map((source) => {
            const type = inferSourceType(source)
            return (
              <li
                key={source.referenceId}
                className="flex items-start gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground"
              >
                <SourceIcon type={type} />
                <span className="min-w-0 flex-1 leading-snug">
                  <span className="font-medium text-foreground">
                    {sourceLabel(source)}
                  </span>
                  {source.title || source.url ? (
                    <>
                      {" - "}
                      {source.title ? (
                        source.url ? (
                          <a
                            className="underline underline-offset-2 hover:text-foreground"
                            href={source.url}
                            rel="noreferrer"
                            target="_blank"
                          >
                            {source.title}
                            <ExternalLink className="ml-0.5 inline size-3" />
                          </a>
                        ) : (
                          <span>{source.title}</span>
                        )
                      ) : source.url ? (
                        <a
                          className="underline underline-offset-2 hover:text-foreground"
                          href={source.url}
                          rel="noreferrer"
                          target="_blank"
                        >
                          {source.url}
                          <ExternalLink className="ml-0.5 inline size-3" />
                        </a>
                      ) : null}
                    </>
                  ) : null}
                </span>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}

export { ResponseSources }
