import { describe, expect, it } from "vitest"

import {
  applicationPaymentReadSchema,
  feeQuoteSchema,
  resolveApplicationPaymentSchema,
  startApplicationPaymentSchema,
} from "./payment"

describe("payment validation", () => {
  it("accepts only catalogue-backed public services", () => {
    expect(feeQuoteSchema.parse({ service: "learner-licence" })).toStrictEqual({
      service: "learner-licence",
    })
    expect(() => feeQuoteSchema.parse({ service: "mobile-update" })).toThrow()
    expect(() =>
      feeQuoteSchema.parse({ service: "renewal", amountPaise: 1 })
    ).toThrow()
  })

  it("normalizes application references and rejects extra payment fields", () => {
    expect(
      applicationPaymentReadSchema.parse({
        applicationNumber: " dlintpayment001 ",
      })
    ).toStrictEqual({ applicationNumber: "DLINTPAYMENT001" })

    expect(() =>
      startApplicationPaymentSchema.parse({
        amountPaise: 1,
        applicationNumber: "DLINTPAYMENT001",
        idempotencyKey: "00000000-0000-4000-8000-000000000901",
      })
    ).toThrow()
  })

  it("requires a deterministic outcome and retry key for resolution", () => {
    expect(
      resolveApplicationPaymentSchema.safeParse({
        applicationNumber: "DLINTPAYMENT001",
        idempotencyKey: "00000000-0000-4000-8000-000000000902",
        outcome: "SUCCESS",
        paymentId: "cm12345678901234567890123",
      }).success
    ).toBe(true)
    expect(
      resolveApplicationPaymentSchema.safeParse({
        applicationNumber: "DLINTPAYMENT001",
        idempotencyKey: "not-a-uuid",
        outcome: "RANDOM",
        paymentId: "payment",
      }).success
    ).toBe(false)
  })
})
