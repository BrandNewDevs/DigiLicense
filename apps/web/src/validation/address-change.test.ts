import { describe, expect, it } from "vitest"

import {
  addressChangeDraftPayloadSchema,
  saveAddressChangeDraftSchema,
  startAddressChangeOtpSchema,
  submitAddressChangeApplicationSchema,
  verifyAddressChangeOtpSchema,
} from "./address-change"

const idempotencyKey = "8fd5dcc4-6146-4629-8a74-c74ca2ef8e03"
const identifier = "c123456789012345678901234"

const validPayload = {
  addressLine1: "Demo House 12, Sector 4",
  addressLine2: "Near the community centre",
  locality: "DWARKA",
  pincode: "110075",
  proofType: "MOCK_UTILITY_BILL",
} as const

describe("address-change validation", () => {
  it("accepts a partial draft and a complete synthetic submission", () => {
    expect(
      addressChangeDraftPayloadSchema.safeParse({ locality: "ROHINI" }).success
    ).toBe(true)
    expect(
      submitAddressChangeApplicationSchema.safeParse({
        ...validPayload,
        declarationAccepted: true,
        idempotencyKey,
        verificationId: identifier,
      }).success
    ).toBe(true)
  })

  it.each([
    ["an Aadhaar number", { ...validPayload, aadhaarNumber: "123412341234" }],
    ["an unexpected proof", { ...validPayload, proofType: "REAL_AADHAAR" }],
    ["a non-Delhi PIN", { ...validPayload, pincode: "400001" }],
    ["an unrecognised locality", { ...validPayload, locality: "GURUGRAM" }],
    ["unsafe address text", { ...validPayload, addressLine1: "<script>" }],
  ])("rejects %s", (_case, payload) => {
    expect(addressChangeDraftPayloadSchema.safeParse(payload).success).toBe(
      false
    )
  })

  it("requires a complete declaration-backed submission", () => {
    expect(
      submitAddressChangeApplicationSchema.safeParse({
        ...validPayload,
        declarationAccepted: false,
        idempotencyKey,
        verificationId: identifier,
      }).success
    ).toBe(false)
    expect(
      submitAddressChangeApplicationSchema.safeParse({
        ...validPayload,
        declarationAccepted: true,
        idempotencyKey,
        verificationId: identifier,
      }).success
    ).toBe(true)
  })

  it("validates strict OTP and draft endpoint inputs", () => {
    expect(
      startAddressChangeOtpSchema.safeParse({
        idempotencyKey,
        licenceRecordId: identifier,
      }).success
    ).toBe(true)
    expect(
      verifyAddressChangeOtpSchema.safeParse({
        idempotencyKey,
        otp: "123456",
        verificationId: identifier,
      }).success
    ).toBe(true)
    expect(
      saveAddressChangeDraftSchema.safeParse({
        payload: { locality: "MAYUR_VIHAR" },
        verificationId: identifier,
      }).success
    ).toBe(true)
    expect(
      verifyAddressChangeOtpSchema.safeParse({
        idempotencyKey,
        otp: "12345x",
        verificationId: identifier,
      }).success
    ).toBe(false)
  })
})
