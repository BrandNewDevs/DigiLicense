import { describe, expect, it } from "vitest"

import { normalizeUniqueConstraintTargets } from "./unique-constraint.shared"

describe("normalizeUniqueConstraintTargets", () => {
  it("normalizes Prisma index-name targets", () => {
    expect(
      normalizeUniqueConstraintTargets("Application_applicationNumber_key")
    ).toEqual(["application_applicationnumber_key"])
  })

  it("extracts quoted PostgreSQL field names", () => {
    expect(
      normalizeUniqueConstraintTargets('Key ("applicantId", "service")=(...)')
    ).toEqual(["applicantid", "service"])
  })

  it("normalizes quoted Prisma target arrays", () => {
    expect(normalizeUniqueConstraintTargets(['"applicationNumber"'])).toEqual([
      "applicationnumber",
    ])
  })
})
