import { describe, expect, it } from "vitest"

import { endMockSession, isMockSessionActive, startMockSession } from "./mock-auth"

describe("browser session state", () => {
  it("keeps only in-memory UI state", () => {
    endMockSession("applicant")

    expect(isMockSessionActive("applicant")).toBe(false)

    startMockSession("applicant")
    expect(isMockSessionActive("applicant")).toBe(true)

    endMockSession("applicant")
    expect(isMockSessionActive("applicant")).toBe(false)
  })
})
