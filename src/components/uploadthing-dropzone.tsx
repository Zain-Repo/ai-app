"use client"

import { UploadCloud } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

type UploadThingDropzoneProps = {
  children: ReactNode
  className?: string
  disabled?: boolean
  inputId: string
  maxFiles?: number
  maxSize?: number
  onUpload: (
    files: File[],
    reportProgress: (progress: number) => void
  ) => Promise<void>
}

function hasFiles(event: DragEvent) {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files")
}

function formatFileSize(bytes: number) {
  return `${Math.round(bytes / (1024 * 1024))} MB`
}

export function UploadThingDropzone({
  children,
  className,
  disabled = false,
  inputId,
  maxFiles = 5,
  maxSize = 20 * 1024 * 1024,
  onUpload,
}: UploadThingDropzoneProps) {
  const dragDepth = useRef(0)
  const [error, setError] = useState("")
  const [isDragOver, setIsDragOver] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [progress, setProgress] = useState(0)

  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (!files.length || disabled || isUploading) return
      if (files.length > maxFiles) {
        setError(`Add no more than ${maxFiles} files at a time.`)
        return
      }
      const invalidFile = files.find(
        (file) => file.size === 0 || file.size > maxSize
      )
      if (invalidFile) {
        setError(
          `${invalidFile.name} must be between 1 byte and ${formatFileSize(maxSize)}.`
        )
        return
      }

      setError("")
      setProgress(0)
      setIsUploading(true)
      try {
        await onUpload(files, (next) =>
          setProgress(Math.max(0, Math.min(100, Math.round(next))))
        )
        setProgress(100)
      } catch (uploadError) {
        setError(
          uploadError instanceof Error
            ? uploadError.message
            : "The files could not be uploaded."
        )
      } finally {
        setIsUploading(false)
      }
    },
    [disabled, isUploading, maxFiles, maxSize, onUpload]
  )

  useEffect(() => {
    const handleDragEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      dragDepth.current += 1
      if (!disabled && !isUploading) setIsDragOver(true)
    }
    const handleDragOver = (event: DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy"
    }
    const handleDragLeave = (event: DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      dragDepth.current = Math.max(0, dragDepth.current - 1)
      if (!dragDepth.current) setIsDragOver(false)
    }
    const handleDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      dragDepth.current = 0
      setIsDragOver(false)
      void uploadFiles(Array.from(event.dataTransfer?.files ?? []))
    }

    window.addEventListener("dragenter", handleDragEnter)
    window.addEventListener("dragover", handleDragOver)
    window.addEventListener("dragleave", handleDragLeave)
    window.addEventListener("drop", handleDrop)
    return () => {
      window.removeEventListener("dragenter", handleDragEnter)
      window.removeEventListener("dragover", handleDragOver)
      window.removeEventListener("dragleave", handleDragLeave)
      window.removeEventListener("drop", handleDrop)
    }
  }, [disabled, isUploading, uploadFiles])

  return (
    <div
      className={cn("relative flex min-h-0 flex-1 flex-col", className)}
      data-slot="uploadthing-dropzone"
    >
      <input
        aria-label="Add project source files"
        className="sr-only"
        disabled={disabled || isUploading}
        id={inputId}
        multiple
        onChange={(event) => {
          void uploadFiles(Array.from(event.target.files ?? []))
          event.target.value = ""
        }}
        type="file"
      />
      {children}

      {isDragOver || isUploading ? (
        <div
          aria-live="polite"
          className="fixed inset-0 z-50 grid place-items-center bg-background/88 p-5 backdrop-blur-sm"
        >
          <div className="grid w-full max-w-lg place-items-center gap-4 rounded-3xl border-2 border-dashed border-primary bg-background px-8 py-14 text-center shadow-2xl">
            <span className="grid size-14 place-items-center rounded-full bg-primary text-primary-foreground">
              <UploadCloud aria-hidden="true" className="size-6" />
            </span>
            <div>
              <p className="font-heading text-xl font-semibold tracking-tight">
                {isUploading
                  ? "Adding project files"
                  : "Drop files to add them"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {isUploading
                  ? `${progress}% complete`
                  : `Up to ${maxFiles} files, ${formatFileSize(maxSize)} each`}
              </p>
            </div>
            {isUploading ? (
              <div
                aria-label={`${progress}% uploaded`}
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={progress}
                className="h-1.5 w-full max-w-64 overflow-hidden rounded-full bg-muted"
                role="progressbar"
              >
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {error ? (
        <p
          className="fixed bottom-5 left-1/2 z-50 max-w-[calc(100vw-2.5rem)] -translate-x-1/2 rounded-full border border-destructive/25 bg-background px-4 py-2 text-center text-sm text-destructive shadow-lg"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </div>
  )
}
