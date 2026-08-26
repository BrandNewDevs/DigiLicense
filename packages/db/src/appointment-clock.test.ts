import { describe, expect, it } from "vitest"

import { createFixedAppointmentClock } from "./appointment-clock.ts"

describe("appointment clock", () => {
  it("returns a fresh fixed timestamp for deterministic workers", () => {
    const clock = createFixedAppointmentClock(
      new Date("2026-08-27T10:00:00.000Z")
    )
    const first = clock.now()
    first.setUTCFullYear(2000)

    expect(clock.now().toISOString()).toBe("2026-08-27T10:00:00.000Z")
  })
})
