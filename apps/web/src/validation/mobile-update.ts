import { z } from "zod"

const idempotencyKeySchema = z.string().uuid()
const requestIdSchema = z.string().trim().min(10).max(64)
const mobileNumberSchema = z.string().trim().regex(/^\d{10}$/)

const startMobileUpdateSchema = z
  .object({
    targetMobileNumber: mobileNumberSchema,
    method: z.enum(["OTP", "MOCK_AADHAAR"]),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict()

const verifyMobileUpdateOtpSchema = z
  .object({
    requestId: requestIdSchema,
    otp: z.string().trim().regex(/^\d{6}$/),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict()

const completeMockAadhaarVerificationSchema = z
  .object({
    requestId: requestIdSchema,
    mockAssertion: z.enum(["MOCK_AADHAAR_PASS", "MOCK_AADHAAR_FAIL"]),
    idempotencyKey: idempotencyKeySchema,
  })
  .strict()

export {
  completeMockAadhaarVerificationSchema,
  startMobileUpdateSchema,
  verifyMobileUpdateOtpSchema,
}
