import useEmblaCarousel from "embla-carousel-react"
import type { UseEmblaCarouselType } from "embla-carousel-react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { motion } from "motion/react"
import * as React from "react"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

type CarouselApi = UseEmblaCarouselType[1]
type UseCarouselParameters = Parameters<typeof useEmblaCarousel>
type CarouselOptions = UseCarouselParameters[0]
type CarouselPlugin = UseCarouselParameters[1]

type CarouselProps = {
  opts?: CarouselOptions
  plugins?: CarouselPlugin
  orientation?: "horizontal" | "vertical"
  setApi?: (api: CarouselApi) => void
}

type CarouselContextProps = {
  carouselRef: ReturnType<typeof useEmblaCarousel>[0]
  api: ReturnType<typeof useEmblaCarousel>[1]
  scrollPrev: () => void
  scrollNext: () => void
  canScrollPrev: boolean
  canScrollNext: boolean
} & CarouselProps

const CarouselContext = React.createContext<CarouselContextProps | null>(null)

function useCarousel() {
  const context = React.useContext(CarouselContext)

  if (!context) {
    throw new Error("useCarousel must be used within a <Carousel />")
  }

  return context
}

function Carousel({
  orientation = "horizontal",
  opts,
  setApi,
  plugins,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & CarouselProps) {
  const [carouselRef, api] = useEmblaCarousel(
    {
      ...opts,
      axis: orientation === "horizontal" ? "x" : "y",
    },
    plugins
  )
  const [canScrollPrev, setCanScrollPrev] = React.useState(false)
  const [canScrollNext, setCanScrollNext] = React.useState(false)

  const onSelect = React.useCallback((carouselApi: CarouselApi) => {
    if (!carouselApi) return

    setCanScrollPrev(carouselApi.canScrollPrev())
    setCanScrollNext(carouselApi.canScrollNext())
  }, [])

  const scrollPrev = React.useCallback(() => {
    api?.scrollPrev()
  }, [api])

  const scrollNext = React.useCallback(() => {
    api?.scrollNext()
  }, [api])

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.target !== event.currentTarget) return

      if (event.key === "ArrowLeft") {
        event.preventDefault()
        scrollPrev()
      } else if (event.key === "ArrowRight") {
        event.preventDefault()
        scrollNext()
      }
    },
    [scrollPrev, scrollNext]
  )

  React.useEffect(() => {
    if (!api || !setApi) return
    setApi(api)
  }, [api, setApi])

  React.useEffect(() => {
    if (!api) return

    onSelect(api)
    api.on("reInit", onSelect)
    api.on("select", onSelect)

    return () => {
      api.off("select", onSelect)
    }
  }, [api, onSelect])

  return (
    <CarouselContext.Provider
      value={{
        carouselRef,
        api,
        opts,
        orientation,
        scrollPrev,
        scrollNext,
        canScrollPrev,
        canScrollNext,
      }}
    >
      <div
        onKeyDown={handleKeyDown}
        className={cn(
          "relative focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring",
          className
        )}
        role="region"
        aria-roledescription="carousel"
        tabIndex={0}
        {...props}
      >
        {children}
      </div>
    </CarouselContext.Provider>
  )
}

function CarouselContent({ className, ...props }: React.ComponentProps<"div">) {
  const { carouselRef, orientation } = useCarousel()

  return (
    <div ref={carouselRef} className="overflow-hidden">
      <div
        className={cn(
          "flex",
          orientation === "horizontal" ? "-ml-4" : "-mt-4 flex-col",
          className
        )}
        {...props}
      />
    </div>
  )
}

function CarouselItem({ className, ...props }: React.ComponentProps<"div">) {
  const { orientation } = useCarousel()

  return (
    <div
      role="group"
      aria-roledescription="slide"
      className={cn(
        "min-w-0 shrink-0 grow-0 basis-full",
        orientation === "horizontal" ? "pl-4" : "pt-4",
        className
      )}
      {...props}
    />
  )
}

function CarouselDots({ className, ...props }: React.ComponentProps<"div">) {
  const { api } = useCarousel()
  const [selectedIndex, setSelectedIndex] = React.useState(0)
  const [snapCount, setSnapCount] = React.useState(0)

  React.useEffect(() => {
    if (!api) return

    const updateSelection = () => {
      setSelectedIndex(api.selectedScrollSnap())
      setSnapCount(api.scrollSnapList().length)
    }

    updateSelection()
    api.on("reInit", updateSelection)
    api.on("select", updateSelection)

    return () => {
      api.off("reInit", updateSelection)
      api.off("select", updateSelection)
    }
  }, [api])

  if (snapCount < 2) return null

  return (
    <div
      aria-label="Carousel slide selector"
      className={cn(
        "mx-auto flex w-fit items-center gap-1 rounded-full bg-background/80 px-2 py-1.5 shadow-sm",
        className
      )}
      role="group"
      {...props}
    >
      {Array.from({ length: snapCount }, (_, index) => {
        const isSelected = index === selectedIndex

        return (
          <button
            aria-label={`Show slide ${index + 1}`}
            aria-pressed={isSelected}
            className={cn(
              "size-2 rounded-full bg-foreground/25 transition-[width,background-color] duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              isSelected && "w-5 bg-[#d96b16]"
            )}
            key={index}
            onClick={() => api?.scrollTo(index)}
            type="button"
          />
        )
      })}
    </div>
  )
}

function CarouselPrevious({
  className,
  variant = "ghost",
  size = "icon",
  ...props
}: React.ComponentProps<typeof Button>) {
  const { orientation, scrollPrev, canScrollPrev } = useCarousel()

  return (
    <motion.div
      className={cn(
        "absolute",
        orientation === "horizontal"
          ? "inset-y-0 -left-12 my-auto"
          : "-top-12 left-1/2 -translate-x-1/2 rotate-90",
        className
      )}
      transition={{ type: "spring", stiffness: 520, damping: 24 }}
      whileTap={canScrollPrev ? { scale: 0.86 } : undefined}
    >
      <Button
        type="button"
        variant={variant}
        size={size}
        className="size-11 rounded-full text-foreground"
        disabled={!canScrollPrev}
        onClick={scrollPrev}
        {...props}
      >
        <ChevronLeft className="size-6" strokeWidth={2.25} />
        <span className="sr-only">Previous slide</span>
      </Button>
    </motion.div>
  )
}

function CarouselNext({
  className,
  variant = "ghost",
  size = "icon",
  ...props
}: React.ComponentProps<typeof Button>) {
  const { orientation, scrollNext, canScrollNext } = useCarousel()

  return (
    <motion.div
      className={cn(
        "absolute",
        orientation === "horizontal"
          ? "inset-y-0 -right-12 my-auto"
          : "-bottom-12 left-1/2 -translate-x-1/2 rotate-90",
        className
      )}
      transition={{ type: "spring", stiffness: 520, damping: 24 }}
      whileTap={canScrollNext ? { scale: 0.86 } : undefined}
    >
      <Button
        type="button"
        variant={variant}
        size={size}
        className="size-11 rounded-full text-foreground"
        disabled={!canScrollNext}
        onClick={scrollNext}
        {...props}
      >
        <ChevronRight className="size-6" strokeWidth={2.25} />
        <span className="sr-only">Next slide</span>
      </Button>
    </motion.div>
  )
}

export {
  Carousel,
  CarouselContent,
  CarouselDots,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
}
