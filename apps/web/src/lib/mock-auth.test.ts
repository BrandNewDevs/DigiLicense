import { describe, expect, it } from "vitest"

import {
  isValidStoredMockSession,
  mockSessionDurationMs,
} from "./mock-auth"

const now = Date.UTC(2026, 7, 22, 12)

function createStoredSession(role: "applicant") {
  return JSON.stringify({
    expiresAt: now + mockSessionDurationMs,
    issuedAt: now,
    role,
    subjectId: "demo-applicant-001",
    version: 1,
  })
}

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

  it("rejects a session with the wrong role", () => {
    expect(
      isValidStoredMockSession(
        JSON.stringify({
          expiresAt: now + mockSessionDurationMs,
          issuedAt: now,
          role: "operator",
          subjectId: "demo-applicant-001",
          version: 1,
        }),
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
