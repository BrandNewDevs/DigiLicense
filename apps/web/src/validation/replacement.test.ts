import { describe, expect, it } from "vitest"

import { replacementSubmissionSchema } from "./replacement"

const validInput = {
  declarationAccepted: true,
  idempotencyKey: "00000000-0000-4000-8000-000000000b01",
  licenceRecordId: "cm12345678901234567890123",
  reason: "LOST",
} as const

describe("replacement validation", () => {
  it("accepts only the bounded replacement command", () => {
    expect(replacementSubmissionSchema.safeParse(validInput).success).toBe(true)
    expect(
      replacementSubmissionSchema.safeParse({
        ...validInput,
        amountPaise: 1,
      }).success
    ).toBe(false)
  })

  it("requires the declaration and a known reason", () => {
    expect(
      replacementSubmissionSchema.safeParse({
        ...validInput,
        declarationAccepted: false,
        reason: "STOLEN_FROM_REAL_PERSON",
      }).success
    ).toBe(false)
  })
})
