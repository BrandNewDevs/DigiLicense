import { describe, expect, it } from "vitest"

import {
  calculateCompletedYears,
  isValidIsoCalendarDate,
  minimumLearnerAgeYears,
} from "./learner-licence"

describe("minimumLearnerAgeYears", () => {
  it("matches the youngest vehicle class", () => {
    expect(minimumLearnerAgeYears).toBe(16)
  })
})

describe("isValidIsoCalendarDate", () => {
  it("accepts a real calendar date", () => {
    expect(isValidIsoCalendarDate("2000-02-29")).toBe(true)
  })

  it.each([
    ["a non-leap leap day", "2001-02-29"],
    ["an impossible month", "2005-13-01"],
    ["an impossible day", "2005-04-31"],
    ["a non-ISO shape", "31/12/2005"],
    ["an empty value", ""],
  ])("rejects %s", (_case, isoDate) => {
    expect(isValidIsoCalendarDate(isoDate)).toBe(false)
  })
})

describe("calculateCompletedYears", () => {
  const reference = new Date("2026-08-24T00:00:00Z")

  it("counts a birthday that already passed this year", () => {
    expect(calculateCompletedYears("2010-01-15", reference)).toBe(16)
  })

  it("does not count a birthday later in the year", () => {
    expect(calculateCompletedYears("2010-12-01", reference)).toBe(15)
  })

  it("treats the birthday itself as completed", () => {
    expect(calculateCompletedYears("2008-08-24", reference)).toBe(18)
  })

  it("handles leap-day births", () => {
    // Feb 28 is before the birthday; Mar 1 is after it.
    expect(calculateCompletedYears("2008-02-29", new Date("2026-02-28"))).toBe(
      17
    )
    expect(calculateCompletedYears("2008-02-29", new Date("2026-03-01"))).toBe(
      18
    )
  })

  it("returns undefined for invalid dates", () => {
    expect(calculateCompletedYears("2005-02-30", reference)).toBeUndefined()
    expect(calculateCompletedYears("not-a-date", reference)).toBeUndefined()
  })
})
