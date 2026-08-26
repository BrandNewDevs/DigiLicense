import type { PointerEvent } from "react"

function useCardGradient() {
  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const x = (event.clientX - bounds.left) / bounds.width - 0.5
    const y = (event.clientY - bounds.top) / bounds.height - 0.5

    event.currentTarget.style.setProperty("--card-gradient-x", `${x * 12}px`)
    event.currentTarget.style.setProperty("--card-gradient-y", `${y * 12}px`)
  }

  const onPointerLeave = (event: PointerEvent<HTMLElement>) => {
    event.currentTarget.style.setProperty("--card-gradient-x", "0px")
    event.currentTarget.style.setProperty("--card-gradient-y", "0px")
  }

  return { onPointerLeave, onPointerMove }
}

export { useCardGradient }
