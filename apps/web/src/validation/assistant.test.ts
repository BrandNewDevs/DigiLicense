import { describe, expect, it } from "vitest"

import { askAssistantSchema } from "./assistant"

const validInput = {
  locale: "en",
  page: "appointment-waitlist",
  question: "Why is there no matching appointment?",
  reasonCode: "NO_MATCHING_SLOT",
  service: "appointment-waitlist",
}

describe("askAssistantSchema", () => {
  it("accepts only the public AI service contract", () => {
    expect(askAssistantSchema.parse(validInput)).toEqual(validInput)
  })

  it("rejects application and identity fields", () => {
    expect(
      askAssistantSchema.safeParse({
        ...validInput,
        applicantId: "applicant-a",
        applicationNumber: "DLDEMO20260001",
        mobileNumber: "9999999999",
      }).success
    ).toBe(false)
  })

  it("rejects invalid semantic-context tokens", () => {
    expect(
      askAssistantSchema.safeParse({
        ...validInput,
        contextToken: "token with spaces",
      }).success
    ).toBe(false)
  })
})
