import { describe, expect, it } from "vitest"

import { renewalSubmissionSchema } from "./renewal"

const validInput = {
  declarationAccepted: true,
  idempotencyKey: "00000000-0000-4000-8000-000000000a01",
  licenceRecordId: "cm12345678901234567890123",
  reason: "EXPIRING_SOON",
} as const

describe("renewal validation", () => {
  it("accepts the bounded applicant command", () => {
    expect(renewalSubmissionSchema.safeParse(validInput).success).toBe(true)
  })

  it("rejects user-entered eligibility dates and unknown fields", () => {
    expect(
      renewalSubmissionSchema.safeParse({
        ...validInput,
        validUntil: "2027-01-01",
      }).success
    ).toBe(false)
  })

  it("requires the declaration and a known reason", () => {
    expect(
      renewalSubmissionSchema.safeParse({
        ...validInput,
        declarationAccepted: false,
        reason: "OTHER",
      }).success
    ).toBe(false)
  })
})
