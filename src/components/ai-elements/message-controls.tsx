"use client"

import { Button } from "@/components/ui/button"
import { ButtonGroup, ButtonGroupText } from "@/components/ui/button-group"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import type { ComponentProps, HTMLAttributes, ReactElement } from "react"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"

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
  label?: string
  tooltip?: string
}

export const MessageAction = ({
  tooltip,
  children,
  label,
  variant = "ghost",
  size = "icon-sm",
  ...props
}: MessageActionProps) => {
  const accessibleLabel = label || tooltip
  const button = (
    <Button
      aria-label={accessibleLabel}
      size={size}
      type="button"
      variant={variant}
      {...props}
    >
      {children}
    </Button>
  )

  if (!tooltip) return button
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger render={button} />
        <TooltipContent>
          <p>{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

interface MessageBranchContextType {
  branches: ReactElement[]
  controlled: boolean
  currentBranch: number
  goToNext: () => void
  goToPrevious: () => void
  setBranches: (branches: ReactElement[]) => void
  totalBranches: number
}

const MessageBranchContext = createContext<MessageBranchContextType | null>(
  null
)

const useMessageBranch = () => {
  const context = useContext(MessageBranchContext)
  if (!context)
    throw new Error(
      "MessageBranch components must be used within MessageBranch"
    )
  return context
}

export type MessageBranchProps = HTMLAttributes<HTMLDivElement> & {
  branch?: number
  branchCount?: number
  defaultBranch?: number
  onBranchChange?: (branchIndex: number) => void
}

export const MessageBranch = ({
  branch,
  branchCount,
  defaultBranch = 0,
  onBranchChange,
  className,
  ...props
}: MessageBranchProps) => {
  const [internalBranch, setInternalBranch] = useState(defaultBranch)
  const [branches, setBranches] = useState<ReactElement[]>([])
  const controlled = branch !== undefined
  const currentBranch = branch ?? internalBranch
  const totalBranches = branchCount ?? branches.length

  const handleBranchChange = useCallback(
    (newBranch: number) => {
      if (newBranch < 0 || newBranch >= totalBranches) return
      if (!controlled) setInternalBranch(newBranch)
      onBranchChange?.(newBranch)
    },
    [controlled, onBranchChange, totalBranches]
  )
  const goToPrevious = useCallback(() => {
    handleBranchChange(
      controlled
        ? currentBranch - 1
        : currentBranch > 0
          ? currentBranch - 1
          : totalBranches - 1
    )
  }, [controlled, currentBranch, handleBranchChange, totalBranches])
  const goToNext = useCallback(() => {
    handleBranchChange(
      controlled
        ? currentBranch + 1
        : currentBranch < totalBranches - 1
          ? currentBranch + 1
          : 0
    )
  }, [controlled, currentBranch, handleBranchChange, totalBranches])
  const contextValue = useMemo<MessageBranchContextType>(
    () => ({
      branches,
      controlled,
      currentBranch,
      goToNext,
      goToPrevious,
      setBranches,
      totalBranches,
    }),
    [branches, controlled, currentBranch, goToNext, goToPrevious, totalBranches]
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
  ) as ReactElement[]

  useEffect(() => {
    if (branches.length !== childrenArray.length) setBranches(childrenArray)
  }, [branches.length, childrenArray, setBranches])

  return childrenArray.map((branch, index) => (
    <div
      className={cn(
        "grid gap-2 overflow-hidden [&>div]:pb-0",
        index === currentBranch ? "block" : "hidden"
      )}
      key={branch.key ?? index}
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
  if (totalBranches <= 1) return null
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
  disabled,
  ...props
}: MessageBranchPreviousProps) => {
  const { controlled, currentBranch, goToPrevious, totalBranches } =
    useMessageBranch()
  return (
    <Button
      aria-label="Previous response"
      disabled={
        totalBranches <= 1 || (controlled && currentBranch === 0) || disabled
      }
      onClick={goToPrevious}
      size="icon-sm"
      type="button"
      variant="ghost"
      {...props}
    >
      {children ?? <ChevronLeftIcon aria-hidden="true" size={14} />}
    </Button>
  )
}

export type MessageBranchNextProps = ComponentProps<typeof Button>

export const MessageBranchNext = ({
  children,
  disabled,
  ...props
}: MessageBranchNextProps) => {
  const { controlled, currentBranch, goToNext, totalBranches } =
    useMessageBranch()
  return (
    <Button
      aria-label="Next response"
      disabled={
        totalBranches <= 1 ||
        (controlled && currentBranch === totalBranches - 1) ||
        disabled
      }
      onClick={goToNext}
      size="icon-sm"
      type="button"
      variant="ghost"
      {...props}
    >
      {children ?? <ChevronRightIcon aria-hidden="true" size={14} />}
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
      aria-live="polite"
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

export type MessageToolbarProps = ComponentProps<"div">

export const MessageToolbar = ({
  className,
  children,
  ...props
}: MessageToolbarProps) => (
  <div
    className={cn(
      "mt-2 flex w-full items-center justify-between gap-4",
      className
    )}
    {...props}
  >
    {children}
  </div>
)
