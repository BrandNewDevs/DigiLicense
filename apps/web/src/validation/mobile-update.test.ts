import { describe, expect, it } from "vitest"

import {
  completeMockAadhaarVerificationSchema,
  startMobileUpdateSchema,
  verifyMobileUpdateOtpSchema,
} from "./mobile-update"

const idempotencyKey = "8fd5dcc4-6146-4629-8a74-c74ca2ef8e03"
const requestId = "cmobilechangerequest000001"

describe("startMobileUpdateSchema", () => {
  it("accepts a strict synthetic mobile-update request", () => {
    expect(
      startMobileUpdateSchema.safeParse({
        idempotencyKey,
        method: "OTP",
        targetMobileNumber: "9000000002",
      }).success
    ).toBe(true)
  })

  it.each([
    { idempotencyKey, method: "SMS", targetMobileNumber: "9000000002" },
    { idempotencyKey, method: "OTP", targetMobileNumber: "900000002" },
    { idempotencyKey, method: "OTP", targetMobileNumber: "9876543210" },
    {
      idempotencyKey: "not-a-uuid",
      method: "OTP",
      targetMobileNumber: "9000000002",
    },
    {
      extra: "rejected",
      idempotencyKey,
      method: "OTP",
      targetMobileNumber: "9000000002",
    },
  ])("rejects invalid input", (input) => {
    expect(startMobileUpdateSchema.safeParse(input).success).toBe(false)
  })
})

describe("verifyMobileUpdateOtpSchema", () => {
  it("accepts a six-digit synthetic OTP", () => {
    expect(
      verifyMobileUpdateOtpSchema.safeParse({
        idempotencyKey,
        otp: "123456",
        requestId,
      }).success
    ).toBe(true)
  })

  it("rejects malformed OTPs", () => {
    expect(
      verifyMobileUpdateOtpSchema.safeParse({
        idempotencyKey,
        otp: "12345x",
        requestId,
      }).success
    ).toBe(false)
  })
})

describe("completeMockAadhaarVerificationSchema", () => {
  it("accepts only fixed synthetic assertions", () => {
    expect(
      completeMockAadhaarVerificationSchema.safeParse({
        idempotencyKey,
        mockAssertion: "MOCK_AADHAAR_PASS",
        requestId,
      }).success
    ).toBe(true)
    expect(
      completeMockAadhaarVerificationSchema.safeParse({
        idempotencyKey,
        mockAssertion: "123412341234",
        requestId,
      }).success
    ).toBe(false)
  })
})
