import { z } from "zod"

const applicantCredentialsSchema = z
  .object({
    role: z.literal("applicant"),
    mobileNumber: z
      .string()
      .trim()
      .regex(/^\d{10}$/),
    otp: z
      .string()
      .trim()
      .regex(/^\d{6}$/),
  })
  .strict()

const demoCredentialsSchema = applicantCredentialsSchema

const demoLogoutSchema = z.object({
  role: z.literal("applicant"),
})

export { demoCredentialsSchema, demoLogoutSchema }
