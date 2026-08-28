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

const judgeId = "demo-applicant-004"

async function createPassedLearner(applicantId: string, updatedAt: Date) {
  const { prisma } = await import("@digilicense/db/server")
  return prisma.application.create({
    data: {
      applicantId,
      applicationNumber: `WL-${crypto.randomUUID()}`,
      nextAction: "Continue.",
      service: "Learner's licence",
      status: "TEST_PASSED",
      updatedAt,
      draft: {
        create: {
          applicantId,
          formPayload: JSON.stringify({ vehicleClass: "LIGHT_MOTOR_VEHICLE" }),
          service: "Learner's licence",
        },
      },
      learnerLicenceDetail: { create: { vehicleClass: "LIGHT_MOTOR_VEHICLE" } },
    },
    select: { applicationNumber: true, id: true },
  })
}

describe.sequential("judge walkthrough", () => {
  beforeEach(async () => {
    await resetAndSeedIntegrationDatabase()
    authenticatedApplicant = judgeId
  })

  afterEach(() => {
    authenticatedApplicant = null
  })

  it("keeps fast-forward isolated to the judge account", async () => {
    const { prisma } = await import("@digilicense/db/server")
    const { advanceWalkthroughWaitingPeriod } =
      await import("./permanent-licence.server")
    const learner = await createPassedLearner(judgeId, new Date())
    const other = await createPassedLearner(
      getIntegrationApplicantId("a"),
      new Date()
    )

    await expect(advanceWalkthroughWaitingPeriod()).resolves.toMatchObject({
      kind: "advanced",
    })
    const adjusted = await prisma.application.findUniqueOrThrow({
      where: { id: learner.id },
    })
    const untouched = await prisma.application.findUniqueOrThrow({
      where: { id: other.id },
    })
    expect(adjusted.updatedAt.getTime()).toBeLessThan(
      untouched.updatedAt.getTime() - 29 * 24 * 60 * 60_000
    )

    authenticatedApplicant = getIntegrationApplicantId("a")
    await expect(advanceWalkthroughWaitingPeriod()).resolves.toMatchObject({
      kind: "not-available",
    })
  })

  it("records the permanent fee, allocates the judge offer, and confirms it", async () => {
    const { prisma } = await import("@digilicense/db/server")
    const { submitPermanentLicenceApplication } =
      await import("./permanent-licence.server")
    const { startApplicationPayment, resolveApplicationPayment } =
      await import("./payment.server")
    const {
      saveAppointmentPreferences,
      readAppointmentJourney,
      acceptAppointmentOffer,
    } = await import("./appointment.server")
    await createPassedLearner(
      judgeId,
      new Date(Date.now() - 31 * 24 * 60 * 60_000)
    )
    const permanent = await submitPermanentLicenceApplication({
      idempotencyKey: "00000000-0000-4000-8000-000000000d01",
      vehicleClass: "LIGHT_MOTOR_VEHICLE",
    })
    if (permanent.kind !== "submitted")
      throw new Error("Expected permanent application")
    const started = await startApplicationPayment({
      applicationNumber: permanent.applicationNumber,
      idempotencyKey: "00000000-0000-4000-8000-000000000d02",
    })
    if (started.kind !== "started") throw new Error("Expected payment start")
    await expect(
      resolveApplicationPayment({
        applicationNumber: permanent.applicationNumber,
        idempotencyKey: "00000000-0000-4000-8000-000000000d03",
        outcome: "SUCCESS",
        paymentId: started.payment.id,
      })
    ).resolves.toMatchObject({ kind: "paid" })
    await prisma.appointmentSlot.create({
      data: {
        endsAt: new Date(Date.now() + 2 * 60 * 60_000),
        inventoryKey: "judge-walkthrough-slot",
        startsAt: new Date(Date.now() + 60 * 60_000),
        vehicleClass: "LIGHT_MOTOR_VEHICLE",
        zone: "CENTRAL_DELHI",
      },
    })
    await expect(
      saveAppointmentPreferences({
        applicationNumber: permanent.applicationNumber,
        idempotencyKey: "00000000-0000-4000-8000-000000000d04",
        notificationChannels: ["SMS"],
        zones: ["CENTRAL_DELHI"],
      })
    ).resolves.toMatchObject({ kind: "saved" })
    const journey = await readAppointmentJourney(permanent.applicationNumber)
    if (journey.kind !== "found" || !journey.offer)
      throw new Error("Expected immediate judge offer")
    await expect(
      acceptAppointmentOffer({
        applicationNumber: permanent.applicationNumber,
        idempotencyKey: "00000000-0000-4000-8000-000000000d05",
        offerId: journey.offer.id,
      })
    ).resolves.toMatchObject({ kind: "confirmed" })
  })

  it("denies reset to other accounts and removes judge records", async () => {
    const { prisma } = await import("@digilicense/db/server")
    const { resetWalkthroughAppointment } = await import("./dashboard.server")
    const learner = await createPassedLearner(judgeId, new Date())
    await prisma.notificationRecord.create({
      data: {
        applicantId: judgeId,
        applicationId: learner.id,
        message: "x",
        title: "x",
      },
    })
    authenticatedApplicant = getIntegrationApplicantId("a")
    await expect(resetWalkthroughAppointment()).resolves.toMatchObject({
      kind: "not-available",
    })
    authenticatedApplicant = judgeId
    await expect(resetWalkthroughAppointment()).resolves.toMatchObject({
      kind: "reset",
    })
    await expect(
      prisma.application.count({ where: { applicantId: judgeId } })
    ).resolves.toBe(0)
    await expect(
      prisma.notificationRecord.count({ where: { applicantId: judgeId } })
    ).resolves.toBe(0)
    await expect(
      prisma.auditEvent.count({
        where: { actorId: judgeId, action: "RESET_WALKTHROUGH" },
      })
    ).resolves.toBe(1)
  })
})
