import { afterEach, describe, expect, it, vi } from "vitest"

import { scheduleMobileUpdateExpiry } from "./mobile-update-expiry"

afterEach(() => {
  vi.useRealTimers()
})

describe("scheduleMobileUpdateExpiry", () => {
  it("runs the expiry transition at the request deadline", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-26T10:00:00.000Z"))
    const onExpired = vi.fn()

    scheduleMobileUpdateExpiry("2026-08-26T10:10:00.000Z", onExpired)

    vi.advanceTimersByTime(9 * 60_000 + 59_999)
    expect(onExpired).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(onExpired).toHaveBeenCalledTimes(1)
  })

  it("cancels the timer when the active request changes or the flow unmounts", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-26T10:00:00.000Z"))
    const onExpired = vi.fn()
    const cleanup = scheduleMobileUpdateExpiry(
      "2026-08-26T10:10:00.000Z",
      onExpired
    )

    cleanup()
    vi.advanceTimersByTime(10 * 60_000)

    expect(onExpired).not.toHaveBeenCalled()
  })
})
