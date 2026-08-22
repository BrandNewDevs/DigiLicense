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

const operatorCredentialsSchema = z
  .object({
    role: z.literal("operator"),
    username: z.string().trim().toLowerCase().min(3).max(64),
    password: z.string().min(1).max(128),
  })
  .strict()

const demoCredentialsSchema = z.discriminatedUnion("role", [
  applicantCredentialsSchema,
  operatorCredentialsSchema,
])

const demoLogoutSchema = z.object({
  role: z.enum(["applicant", "operator"]),
})

export { demoCredentialsSchema, demoLogoutSchema }
