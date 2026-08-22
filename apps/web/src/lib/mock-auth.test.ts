import { describe, expect, it } from "vitest"

import {
  isValidStoredMockSession,
  mockSessionDurationMs,
  validateMockCredentials,
} from "./mock-auth"

const now = Date.UTC(2026, 7, 22, 12)

function createStoredSession(role: "applicant" | "operator") {
  return JSON.stringify({
    expiresAt: now + mockSessionDurationMs,
    issuedAt: now,
    role,
    subjectId:
      role === "applicant" ? "demo-applicant-001" : "demo-operator-001",
    version: 1,
  })
}

describe("validateMockCredentials", () => {
  it("accepts the fixed applicant credentials", () => {
    expect(
      validateMockCredentials("applicant", {
        mobileNumber: "9000000001",
        otp: "123456",
      })
    ).toBe(true)
  })

  it("rejects an incorrect applicant OTP", () => {
    expect(
      validateMockCredentials("applicant", {
        mobileNumber: "9000000001",
        otp: "000000",
      })
    ).toBe(false)
  })

  it("does not accept operator credentials for an applicant", () => {
    expect(
      validateMockCredentials("applicant", {
        password: "demo-only",
        username: "operator.demo",
      })
    ).toBe(false)
  })

  it("rejects unexpected credential fields", () => {
    expect(
      validateMockCredentials("applicant", {
        extra: "unexpected",
        mobileNumber: "9000000001",
        otp: "123456",
      })
    ).toBe(false)
  })
})

describe("isValidStoredMockSession", () => {
  it("accepts a current applicant session for the applicant role", () => {
    expect(
      isValidStoredMockSession(
        createStoredSession("applicant"),
        "applicant",
        now
      )
    ).toBe(true)
  })

  it("rejects an operator session for the applicant role", () => {
    expect(
      isValidStoredMockSession(
        createStoredSession("operator"),
        "applicant",
        now
      )
    ).toBe(false)
  })

  it("rejects an expired session", () => {
    expect(
      isValidStoredMockSession(
        createStoredSession("applicant"),
        "applicant",
        now + mockSessionDurationMs
      )
    ).toBe(false)
  })

  it.each([null, "active", "{}", "not-json"])(
    "rejects malformed session state: %s",
    (storedValue) => {
      expect(isValidStoredMockSession(storedValue, "applicant", now)).toBe(
        false
      )
    }
  )

  it("rejects a session for an unexpected subject", () => {
    const session = JSON.stringify({
      expiresAt: now + mockSessionDurationMs,
      issuedAt: now,
      role: "applicant",
      subjectId: "another-applicant",
      version: 1,
    })

    expect(isValidStoredMockSession(session, "applicant", now)).toBe(false)
  })
})
