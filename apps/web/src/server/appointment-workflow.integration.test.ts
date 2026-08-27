import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  getIntegrationApplicantId,
  resetAndSeedIntegrationDatabase,
} from "../test/integration-fixtures"

let authenticatedApplicant: string | null = null

vi.mock("./demo-session.server", () => ({
  requireApplicant: vi.fn(async () =>
    authenticatedApplicant
      ? { applicantId: authenticatedApplicant, authVersion: 1 }
      : null
  ),
}))

async function createPermanentApplication(): Promise<string> {
  const { prisma } = await import("@digilicense/db/server")
  const applicantId = getIntegrationApplicantId("a")
  const passedAt = new Date(Date.now() - 31 * 24 * 60 * 60_000)
  const learner = await prisma.application.create({
    data: {
      applicantId,
      applicationNumber: "DLINTAPPOINTMENTLEARNER",
      nextAction: "Learner test passed.",
      service: "Learner's licence",
      status: "TEST_PASSED",
      updatedAt: passedAt,
    },
    select: { id: true },
  })
  await prisma.applicationDraft.create({
    data: {
      applicantId,
      applicationId: learner.id,
      formPayload: JSON.stringify({ vehicleClass: "LIGHT_MOTOR_VEHICLE" }),
      service: "Learner's licence",
    },
  })
  const application = await prisma.application.create({
    data: {
      applicantId,
      applicationNumber: "DLINTAPPOINTMENTPERMANENT",
      blockingReasonCode: "APPOINTMENT_PREFERENCES_REQUIRED",
      nextAction: "Choose appointment preferences.",
      service: "Permanent driving licence",
      status: "WAITLISTED",
    },
    select: { id: true },
  })
  await prisma.permanentLicenceDetail.create({
    data: {
      applicantId,
      applicationId: application.id,
      idempotencyKey: "00000000-0000-4000-8000-000000000701",
      learnerApplicationId: learner.id,
      learnerEligibilityDeadlineAt: new Date(
        passedAt.getTime() + 180 * 24 * 60 * 60_000
      ),
      vehicleClass: "LIGHT_MOTOR_VEHICLE",
    },
  })
  return "DLINTAPPOINTMENTPERMANENT"
}

describe.sequential("PostgreSQL permanent appointment workflow", () => {
  beforeEach(async () => {
    await resetAndSeedIntegrationDatabase()
    authenticatedApplicant = getIntegrationApplicantId("a")
  })

  afterEach(() => {
    authenticatedApplicant = null
  })

  it("records preferences, allocates an offer, and confirms it idempotently", async () => {
    const { allocateAvailableAppointmentOffers, prisma } =
      await import("@digilicense/db/server")
    const {
      acceptAppointmentOffer,
      readAppointmentJourney,
      saveAppointmentPreferences,
    } = await import("./appointment.server")
    const applicationNumber = await createPermanentApplication()
    const saved = await saveAppointmentPreferences({
      applicationNumber,
      idempotencyKey: "00000000-0000-4000-8000-000000000702",
      notificationChannels: ["SMS", "EMAIL"],
      zones: ["CENTRAL_DELHI", "EAST_DELHI"],
    })
    expect(saved.kind).toBe("saved")

    const learner = await prisma.application.findUniqueOrThrow({
      where: { applicationNumber: "DLINTAPPOINTMENTLEARNER" },
      select: { id: true },
    })
    const ineligible = await prisma.application.create({
      data: {
        applicantId: getIntegrationApplicantId("a"),
        applicationNumber: "DLINTAPPOINTMENTINELIGIBLE",
        nextAction: "Not eligible for an appointment.",
        service: "Permanent driving licence",
        status: "APPROVED",
      },
      select: { id: true },
    })
    await prisma.permanentLicenceDetail.create({
      data: {
        applicantId: getIntegrationApplicantId("a"),
        applicationId: ineligible.id,
        idempotencyKey: "00000000-0000-4000-8000-000000000704",
        learnerApplicationId: learner.id,
        learnerEligibilityDeadlineAt: new Date(),
        vehicleClass: "LIGHT_MOTOR_VEHICLE",
      },
    })
    const latestEligibleJourney = await readAppointmentJourney(undefined)
    expect(latestEligibleJourney).toMatchObject({
      applicationNumber,
      kind: "found",
    })

    await prisma.appointmentSlot.create({
      data: {
        endsAt: new Date(Date.now() + 26 * 60 * 60_000),
        inventoryKey: "integration-phase-two-slot",
        startsAt: new Date(Date.now() + 25 * 60 * 60_000),
        vehicleClass: "LIGHT_MOTOR_VEHICLE",
        zone: "CENTRAL_DELHI",
      },
    })
    await expect(allocateAvailableAppointmentOffers()).resolves.toMatchObject({
      offeredCount: 1,
    })
    const journey = await readAppointmentJourney(applicationNumber)
    expect(journey.kind).toBe("found")
    if (journey.kind !== "found")
      throw new Error("Expected the owned appointment journey to be found")
    expect(journey.offer).not.toBeNull()
    if (!journey.offer)
      throw new Error(
        "Expected allocation to create an active appointment offer"
      )
    expect(journey.offer.ranking.policyVersion).toBe("appointment-v1")
    expect(journey.preferences.notificationChannels).toEqual(["SMS", "EMAIL"])

    const input = {
      applicationNumber,
      idempotencyKey: "00000000-0000-4000-8000-000000000703",
      offerId: journey.offer.id,
    }
    await expect(acceptAppointmentOffer(input)).resolves.toMatchObject({
      kind: "confirmed",
    })
    await expect(acceptAppointmentOffer(input)).resolves.toMatchObject({
      kind: "confirmed",
    })
    await expect(
      prisma.confirmedAppointment.count({
        where: { application: { applicationNumber } },
      })
    ).resolves.toBe(1)
  })
})
