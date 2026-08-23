import { describe, expect, it } from "vitest"

import {
  learnerLicenceDraftPayloadSchema,
  learnerLicenceSubmissionSchema,
} from "./learner-licence"

describe("learnerLicenceDraftPayloadSchema", () => {
  it("accepts a valid partial payload", () => {
    expect(
      learnerLicenceDraftPayloadSchema.safeParse({
        fullName: "Asha Devi",
        vehicleClass: "MOTORCYCLE_WITH_GEAR",
      }).success
    ).toBe(true)
  })

  it("accepts an empty object for a fresh draft", () => {
    expect(learnerLicenceDraftPayloadSchema.safeParse({}).success).toBe(true)
  })

  it.each([
    ["an unknown field", { fullName: "Asha Devi", aadhaarNumber: "1234" }],
    ["a name with digits", { fullName: "Asha 123" }],
    ["a name below the minimum length", { fullName: "A" }],
    ["an impossible birth date", { dateOfBirth: "2005-02-30" }],
    ["a non-ISO birth date", { dateOfBirth: "01/01/2005" }],
    ["an unknown vehicle class", { vehicleClass: "TRUCK" }],
    ["an unknown zone", { zone: "WEST_DELHI" }],
    ["an unknown proof type", { identityProofType: "REAL_PASSPORT" }],
  ])("rejects %s", (_case, input) => {
    expect(learnerLicenceDraftPayloadSchema.safeParse(input).success).toBe(
      false
    )
  })
})

describe("learnerLicenceSubmissionSchema", () => {
  const validSubmission = {
    addressProofType: "MOCK_UTILITY_BILL",
    declarationAccepted: true,
    dateOfBirth: "2000-06-15",
    fullName: "Asha Devi",
    identityProofType: "MOCK_AADHAAR_CARD",
    vehicleClass: "MOTORCYCLE_WITH_GEAR",
    zone: "CENTRAL_DELHI",
  }

  it("accepts a complete submission that meets the age rule", () => {
    expect(
      learnerLicenceSubmissionSchema.safeParse(validSubmission).success
    ).toBe(true)
  })

  it.each([
    ["a missing declaration", { ...validSubmission, declarationAccepted: undefined }],
    ["a refused declaration", { ...validSubmission, declarationAccepted: false }],
    ["a missing field", { ...validSubmission, zone: undefined }],
  ])("rejects %s", (_case, input) => {
    expect(learnerLicenceSubmissionSchema.safeParse(input).success).toBe(false)
  })

  it("rejects an applicant under the class minimum age", () => {
    const underAge = {
      ...validSubmission,
      dateOfBirth: new Date(
        Date.now() - 17 * 365.25 * 24 * 60 * 60 * 1000
      )
        .toISOString()
        .slice(0, 10),
    }

    const result = learnerLicenceSubmissionSchema.safeParse(underAge)

    expect(result.success).toBe(false)
  })

  it("allows a 16-year-old only on a gearless motorcycle", () => {
    const sixteenYearsAgo = new Date(
      Date.now() - 16.5 * 365.25 * 24 * 60 * 60 * 1000
    )
      .toISOString()
      .slice(0, 10)

    expect(
      learnerLicenceSubmissionSchema.safeParse({
        ...validSubmission,
        dateOfBirth: sixteenYearsAgo,
        vehicleClass: "MOTORCYCLE_WITHOUT_GEAR",
      }).success
    ).toBe(true)

    expect(
      learnerLicenceSubmissionSchema.safeParse({
        ...validSubmission,
        dateOfBirth: sixteenYearsAgo,
        vehicleClass: "LIGHT_MOTOR_VEHICLE",
      }).success
    ).toBe(false)
  })
})
