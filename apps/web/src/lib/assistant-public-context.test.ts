import { describe, expect, it } from "vitest"

import {
  defaultAssistantPublicContext,
  getAssistantReasonForBlockingCode,
  getRouteAssistantPublicContext,
} from "./assistant-public-context"

describe("assistant public route context", () => {
  it.each([
    [
      "/dashboard",
      { page: "dashboard", reasonCode: "NONE", service: "application-status" },
    ],
    [
      "/services/permanent-licence",
      {
        page: "eligibility",
        reasonCode: "NONE",
        service: "permanent-driving-licence",
      },
    ],
    [
      "/services/appointments",
      {
        page: "appointment-booking",
        reasonCode: "NONE",
        service: "appointment-waitlist",
      },
    ],
    [
      "/services/track-application",
      {
        page: "application-status",
        reasonCode: "NONE",
        service: "application-status",
      },
    ],
  ] as const)(
    "maps %s without identity or record context",
    (pathname, expected) => {
      expect(getRouteAssistantPublicContext(pathname)).toEqual(expected)
    }
  )

  it("falls back to the bounded general assistant context", () => {
    expect(getRouteAssistantPublicContext("/unknown")).toEqual(
      defaultAssistantPublicContext
    )
  })
})

describe("assistant public blocker context", () => {
  it.each([
    ["WAITING_PERIOD_NOT_MET", "WAITING_PERIOD_ACTIVE"],
    ["APPOINTMENT_SLOT_UNAVAILABLE", "NO_MATCHING_SLOT"],
    ["APPOINTMENT_OFFER_ACTION_REQUIRED", "OFFER_PENDING"],
    ["APPOINTMENT_PREFERENCES_REQUIRED", "PREPARATION_REQUIRED"],
    ["PAYMENT_CONFIRMATION_PENDING", "ACTION_LOCKED"],
    [null, "NONE"],
  ] as const)("maps %s to %s", (blockingCode, expected) => {
    expect(getAssistantReasonForBlockingCode(blockingCode)).toBe(expected)
  })
})
