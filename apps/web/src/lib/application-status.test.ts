import { describe, expect, it } from "vitest"

import {
  getApplicationStatusLabel,
  getBlockingReasonMessage,
} from "./application-status"

describe("appointment application status copy", () => {
  it("uses explicit labels for appointment offer states", () => {
    expect(getApplicationStatusLabel("APPOINTMENT_OFFERED")).toBe(
      "Appointment offer available"
    )
    expect(getApplicationStatusLabel("APPOINTMENT_CONFIRMED")).toBe(
      "Appointment confirmed"
    )
  })

  it("explains appointment preference and offer-action blockers", () => {
    expect(
      getBlockingReasonMessage("APPOINTMENT_PREFERENCES_REQUIRED")
    ).toContain("preferences")
    expect(
      getBlockingReasonMessage("APPOINTMENT_OFFER_ACTION_REQUIRED")
    ).toContain("deadline")
  })
})
