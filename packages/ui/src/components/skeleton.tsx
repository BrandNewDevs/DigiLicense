import type { ComponentProps } from "react"

import { cn } from "@workspace/ui/lib/utils"

function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-md bg-muted", className)}
      data-slot="skeleton"
      {...props}
    />
  )
}

export { Skeleton }
