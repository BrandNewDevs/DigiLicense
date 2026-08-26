import { describe, expect, it } from "vitest"

import { permanentLicenceSubmissionSchema } from "./permanent-licence"

const idempotencyKey = "8f8c591d-1cf2-4e8a-ae0f-7edf0f2cb040"

describe("permanentLicenceSubmissionSchema", () => {
  it("accepts each learner vehicle class with a UUID idempotency key", () => {
    for (const vehicleClass of [
      "MOTORCYCLE_WITHOUT_GEAR",
      "MOTORCYCLE_WITH_GEAR",
      "LIGHT_MOTOR_VEHICLE",
    ]) {
      expect(
        permanentLicenceSubmissionSchema.safeParse({
          idempotencyKey,
          vehicleClass,
        }).success
      ).toBe(true)
    }
  })

  it("rejects a class that cannot match a learner application", () => {
    expect(
      permanentLicenceSubmissionSchema.safeParse({
        idempotencyKey,
        vehicleClass: "CAR",
      }).success
    ).toBe(false)
  })

  it("rejects a non-UUID idempotency key", () => {
    expect(
      permanentLicenceSubmissionSchema.safeParse({
        idempotencyKey: "retry-1",
        vehicleClass: "LIGHT_MOTOR_VEHICLE",
      }).success
    ).toBe(false)
  })

  it("rejects unexpected submission fields", () => {
    expect(
      permanentLicenceSubmissionSchema.safeParse({
        idempotencyKey,
        vehicleClass: "LIGHT_MOTOR_VEHICLE",
        waitingPeriodDays: 0,
      }).success
    ).toBe(false)
  })
})
