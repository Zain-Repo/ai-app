import { Image as ImageIcon, LoaderCircle } from "lucide-react"
import { usePaginatedQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { useCallback, useEffect, useRef, useState } from "react"

import { api } from "../../../convex/_generated/api"
import type { CarouselApi } from "@/components/ui/carousel"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const PAGE_SIZE = 8
const LOAD_AHEAD_SLIDES = 2

type LibraryAsset = FunctionReturnType<typeof api.library.list>["page"][number]
type RecentGeneration = Extract<LibraryAsset, { category: "generated_image" }>

function isRecentGeneration(asset: LibraryAsset): asset is RecentGeneration {
  return asset.category === "generated_image"
}

function lastVisibleSlide(emblaApi: NonNullable<CarouselApi>) {
  const visibleSlides = emblaApi.slidesInView()
  return visibleSlides.at(-1) ?? emblaApi.selectedScrollSnap()
}

export function RecentGenerationsCarousel({
  layout = "wide",
}: {
  layout?: "rail" | "wide"
}) {
  const { loadMore, results, status } = usePaginatedQuery(
    api.library.list,
    { category: "generated_image", search: undefined },
    { initialNumItems: PAGE_SIZE }
  )
  const [carouselApi, setCarouselApi] = useState<CarouselApi>()
  const [selectedGeneration, setSelectedGeneration] =
    useState<RecentGeneration | null>(null)
  const [unavailableIds, setUnavailableIds] = useState<Set<string>>(
    () => new Set()
  )
  // Embla may emit both selection and reinitialization events for one appended
  // page, so gate requests by the number of results that triggered the load.
  const requestedAtResultCount = useRef<number | null>(null)
  const recentGenerations = results.filter(isRecentGeneration)

  const loadNextPageNearEnd = useCallback(() => {
    if (!carouselApi || status !== "CanLoadMore" || results.length === 0) return

    const isNearEnd =
      lastVisibleSlide(carouselApi) >=
      Math.max(0, results.length - LOAD_AHEAD_SLIDES - 1)
    if (!isNearEnd || requestedAtResultCount.current === results.length) return

    requestedAtResultCount.current = results.length
    loadMore(PAGE_SIZE)
  }, [carouselApi, loadMore, results.length, status])

  useEffect(() => {
    if (!carouselApi) return

    carouselApi.on("select", loadNextPageNearEnd)
    carouselApi.on("reInit", loadNextPageNearEnd)
    loadNextPageNearEnd()

    return () => {
      carouselApi.off("select", loadNextPageNearEnd)
      carouselApi.off("reInit", loadNextPageNearEnd)
    }
  }, [carouselApi, loadNextPageNearEnd])

  const markUnavailable = (generation: RecentGeneration) => {
    setUnavailableIds((current) => {
      const next = new Set(current)
      next.add(generation._id)
      return next
    })
  }

  if (status === "LoadingFirstPage") {
    return (
      <div
        aria-label="Loading recent generations"
        className={
          layout === "rail"
            ? "grid grid-cols-3 gap-2"
            : "grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4"
        }
        role="status"
      >
        {Array.from({ length: 4 }, (_, index) => (
          <span
            aria-hidden="true"
            className="min-h-24 animate-pulse rounded-md border bg-muted/20 motion-reduce:animate-none sm:min-h-28"
            key={index}
          />
        ))}
      </div>
    )
  }

  if (recentGenerations.length === 0) {
    return (
      <p className="border-y py-4 text-xs text-muted-foreground">
        Your generated images will appear here.
      </p>
    )
  }

  const selectedIsUnavailable = Boolean(
    selectedGeneration && unavailableIds.has(selectedGeneration._id)
  )

  return (
    <>
      <Carousel
        aria-label="Recent generated images"
        className="group/carousel min-w-0"
        opts={{ align: "start", containScroll: "trimSnaps" }}
        setApi={setCarouselApi}
      >
        <CarouselContent className="-ml-2">
          {recentGenerations.map((generation) => {
            const isUnavailable =
              !generation.url || unavailableIds.has(generation._id)

            return (
              <CarouselItem
                className={
                  layout === "rail"
                    ? "basis-1/3 pl-2"
                    : "basis-1/2 pl-2 sm:basis-1/3 xl:basis-1/4"
                }
                key={generation._id}
              >
                {isUnavailable ? (
                  <div
                    aria-label={`${generation.name} is unavailable`}
                    className="grid min-h-24 place-items-center rounded-md border bg-muted/10 text-muted-foreground sm:min-h-28"
                    role="img"
                  >
                    <ImageIcon aria-hidden="true" className="size-5" />
                  </div>
                ) : (
                  <button
                    aria-label={`View ${generation.name}`}
                    className="group/image relative block min-h-24 w-full overflow-hidden rounded-md border bg-muted/20 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none sm:min-h-28"
                    onClick={() => setSelectedGeneration(generation)}
                    type="button"
                  >
                    <img
                      alt={generation.name}
                      className="absolute inset-0 size-full object-cover transition-transform duration-300 group-hover/image:scale-[1.02] motion-reduce:transition-none"
                      loading="lazy"
                      onError={() => markUnavailable(generation)}
                      src={generation.url!}
                    />
                    <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-2.5 pt-6 pb-2 text-[11px] font-medium text-white opacity-0 transition-opacity group-focus-within/image:opacity-100 group-hover/image:opacity-100 motion-reduce:transition-none">
                      {generation.model ?? generation.name}
                    </span>
                  </button>
                )}
              </CarouselItem>
            )
          })}
          {status === "LoadingMore" ? (
            <CarouselItem
              className={
                layout === "rail"
                  ? "basis-1/3 pl-2"
                  : "basis-1/2 pl-2 sm:basis-1/3 xl:basis-1/4"
              }
            >
              <div
                className="grid min-h-24 place-items-center rounded-md border bg-muted/10 text-muted-foreground sm:min-h-28"
                role="status"
              >
                <span className="flex items-center gap-2 text-xs">
                  <LoaderCircle
                    aria-hidden="true"
                    className="size-4 animate-spin motion-reduce:animate-none"
                  />
                  Loading more
                </span>
              </div>
            </CarouselItem>
          ) : null}
        </CarouselContent>
        <CarouselPrevious className="left-2 border-background/60 bg-background/90 opacity-0 shadow-sm backdrop-blur-sm transition-opacity group-focus-within/carousel:opacity-100 group-hover/carousel:opacity-100 disabled:hidden motion-reduce:transition-none" />
        <CarouselNext className="right-2 border-background/60 bg-background/90 opacity-0 shadow-sm backdrop-blur-sm transition-opacity group-focus-within/carousel:opacity-100 group-hover/carousel:opacity-100 disabled:hidden motion-reduce:transition-none" />
      </Carousel>

      <Dialog
        onOpenChange={(open) => !open && setSelectedGeneration(null)}
        open={Boolean(selectedGeneration)}
      >
        <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>{selectedGeneration?.name}</DialogTitle>
            <DialogDescription>
              {selectedGeneration?.model ?? "Generated image"}
            </DialogDescription>
          </DialogHeader>
          {selectedGeneration?.url && !selectedIsUnavailable ? (
            <img
              alt={selectedGeneration.name}
              className="max-h-[70svh] w-full rounded-md bg-muted/20 object-contain"
              onError={() => markUnavailable(selectedGeneration)}
              src={selectedGeneration.url}
            />
          ) : (
            <div
              className="grid min-h-64 place-items-center rounded-md border bg-muted/10 text-sm text-muted-foreground"
              role="status"
            >
              This image is temporarily unavailable.
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
