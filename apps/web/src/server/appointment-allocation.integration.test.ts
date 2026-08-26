import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  getIntegrationApplicantId,
  resetAndSeedIntegrationDatabase,
} from "../test/integration-fixtures"

const now = new Date("2026-08-27T10:00:00.000Z")

async function createEligibleAppointmentScenario(): Promise<{
  entryId: string
  permanentApplicationId: string
  slotId: string
}> {
  const { prisma } = await import("@digilicense/db/server")
  const applicantId = getIntegrationApplicantId("a")
  const learner = await prisma.application.create({
    data: {
      applicantId,
      applicationNumber: "DLINTLEARNER0001",
      nextAction: "Learner test passed.",
      service: "Learner's licence",
      status: "TEST_PASSED",
      submittedAt: new Date("2026-07-01T10:00:00.000Z"),
    },
    select: { id: true },
  })
  const permanent = await prisma.application.create({
    data: {
      applicantId,
      applicationNumber: "DLINTPERMANENT0001",
      blockingReasonCode: "APPOINTMENT_SLOT_UNAVAILABLE",
      nextAction: "Wait for an appointment offer.",
      service: "Permanent driving licence",
      status: "WAITLISTED",
    },
    select: { id: true },
  })
  await prisma.permanentLicenceDetail.create({
    data: {
      applicantId,
      applicationId: permanent.id,
      idempotencyKey: "integration-permanent-appointment-0001",
      learnerApplicationId: learner.id,
      learnerEligibilityDeadlineAt: new Date("2026-09-11T10:00:00.000Z"),
      vehicleClass: "LIGHT_MOTOR_VEHICLE",
    },
  })
  const entry = await prisma.appointmentWaitlistEntry.create({
    data: {
      applicantId,
      applicationId: permanent.id,
      joinIdempotencyKey: "integration-waitlist-entry-0001",
      originalJoinedAt: new Date("2026-08-20T10:00:00.000Z"),
      preferences: {
        create: [
          { rank: 1, zone: "CENTRAL_DELHI" },
          { rank: 2, zone: "EAST_DELHI" },
        ],
      },
      notificationPreferences: {
        create: [
          {
            channel: "SMS",
            recipientAlias: "synthetic-sms:integration-applicant-a",
          },
          {
            channel: "EMAIL",
            recipientAlias: "synthetic-email:integration-applicant-a",
          },
        ],
      },
    },
    select: { id: true },
  })
  const slot = await prisma.appointmentSlot.create({
    data: {
      endsAt: new Date("2026-08-28T11:00:00.000Z"),
      inventoryKey: "integration-slot-0001",
      startsAt: new Date("2026-08-28T10:00:00.000Z"),
      vehicleClass: "LIGHT_MOTOR_VEHICLE",
      zone: "CENTRAL_DELHI",
    },
    select: { id: true },
  })

  return {
    entryId: entry.id,
    permanentApplicationId: permanent.id,
    slotId: slot.id,
  }
}

describe.sequential("PostgreSQL appointment allocation foundation", () => {
  beforeEach(async () => {
    await resetAndSeedIntegrationDatabase()
  })

  afterEach(async () => {
    const { prisma } = await import("@digilicense/db/server")
    await prisma.appointmentNotificationDelivery.deleteMany()
    await prisma.confirmedAppointment.deleteMany()
    await prisma.appointmentOffer.deleteMany()
    await prisma.appointmentNotificationPreference.deleteMany()
    await prisma.appointmentPreference.deleteMany()
    await prisma.appointmentWaitlistEntry.deleteMany()
    await prisma.appointmentSlot.deleteMany()
  })

  it("creates exactly one durable offer with an explainable ranking snapshot under concurrent workers", async () => {
    const {
      createFixedAppointmentClock,
      allocateAvailableAppointmentOffers,
      prisma,
    } = await import("@digilicense/db/server")
    const scenario = await createEligibleAppointmentScenario()
    const clock = createFixedAppointmentClock(now)

    const results = await Promise.all([
      allocateAvailableAppointmentOffers(clock),
      allocateAvailableAppointmentOffers(clock),
    ])

    expect(
      results.reduce((count, result) => count + result.offeredCount, 0)
    ).toBe(1)
    const offer = await prisma.appointmentOffer.findUniqueOrThrow({
      where: { slotId: scenario.slotId },
      include: { deliveries: true },
    })
    const application = await prisma.application.findUniqueOrThrow({
      where: { id: scenario.permanentApplicationId },
      include: { auditEvents: true, notifications: true, workflowEvents: true },
    })

    expect(offer.waitlistEntryId).toBe(scenario.entryId)
    expect(offer.status).toBe("ACTIVE")
    expect(offer.rankingPolicyVersion).toBe("appointment-v1")
    expect(offer.rankingScore).toBe(47)
    expect(offer.rankingBreakdown).toEqual({
      preferencePoints: 10,
      urgencyPoints: 30,
      waitTimePoints: 7,
    })
    expect(offer.deliveries).toHaveLength(2)
    expect(JSON.stringify(offer.deliveries)).not.toContain("9100000001")
    expect(application.status).toBe("APPOINTMENT_OFFERED")
    expect(application.blockingReasonCode).toBe(
      "APPOINTMENT_OFFER_ACTION_REQUIRED"
    )
    expect(application.workflowEvents).toHaveLength(1)
    expect(application.notifications).toHaveLength(1)
    expect(application.auditEvents).toHaveLength(1)
  })

  it("expires an offer into a cooldown and reactivates it without losing queue age", async () => {
    const {
      allocateAvailableAppointmentOffers,
      createFixedAppointmentClock,
      expireDueAppointmentOffers,
      prisma,
      reactivateElapsedAppointmentCooldowns,
    } = await import("@digilicense/db/server")
    const scenario = await createEligibleAppointmentScenario()
    await allocateAvailableAppointmentOffers(createFixedAppointmentClock(now))
    const offer = await prisma.appointmentOffer.findUniqueOrThrow({
      where: { slotId: scenario.slotId },
    })
    const expiryTime = new Date(offer.expiresAt.getTime() + 1)

    await expect(
      expireDueAppointmentOffers(createFixedAppointmentClock(expiryTime))
    ).resolves.toEqual({ expiredCount: 1 })
    const expiredEntry =
      await prisma.appointmentWaitlistEntry.findUniqueOrThrow({
        where: { id: scenario.entryId },
      })
    const expiredSlot = await prisma.appointmentSlot.findUniqueOrThrow({
      where: { id: scenario.slotId },
    })
    expect(expiredEntry.status).toBe("COOLDOWN")
    expect(expiredEntry.originalJoinedAt).toEqual(
      new Date("2026-08-20T10:00:00.000Z")
    )
    expect(expiredSlot.status).toBe("OPEN")

    const cooldownEnd = expiredEntry.availableAfter
    expect(cooldownEnd).not.toBeNull()
    if (!cooldownEnd) return
    await expect(
      reactivateElapsedAppointmentCooldowns(
        createFixedAppointmentClock(new Date(cooldownEnd.getTime() + 1))
      )
    ).resolves.toBe(1)
    await expect(
      prisma.appointmentWaitlistEntry.findUniqueOrThrow({
        where: { id: scenario.entryId },
      })
    ).resolves.toMatchObject({ availableAfter: null, status: "ACTIVE" })
  })
})
