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

async function recordSuccessfulPayment(
  applicationNumber: string,
  startKey: string,
  resolutionKey: string
): Promise<void> {
  const { resolveApplicationPayment, startApplicationPayment } =
    await import("./payment.server")
  const payment = await startApplicationPayment({
    applicationNumber,
    idempotencyKey: startKey,
  })
  if (payment.kind !== "started") throw new Error("Expected payment start")
  const resolved = await resolveApplicationPayment({
    applicationNumber,
    idempotencyKey: resolutionKey,
    outcome: "SUCCESS",
    paymentId: payment.payment.id,
  })
  if (resolved.kind !== "paid") throw new Error("Expected paid outcome")
}

describe.sequential("PostgreSQL primary applicant journey", () => {
  beforeEach(async () => {
    await resetAndSeedIntegrationDatabase()
    authenticatedApplicant = getIntegrationApplicantId("a")
  })

  afterEach(() => {
    authenticatedApplicant = null
  })

  it("completes learner submission through appointment confirmation", async () => {
    const { allocateAvailableAppointmentOffers, prisma } =
      await import("@digilicense/db/server")
    const { submitLearnerLicenceApplication } =
      await import("./learner-licence.server")
    const { getLearnerTestAnswerKey, learnerTestBank } =
      await import("./learner-test-bank.server")
    const { submitLearnerTest } = await import("./learner-test.server")
    const { submitPermanentLicenceApplication } =
      await import("./permanent-licence.server")
    const {
      acceptAppointmentOffer,
      readAppointmentJourney,
      saveAppointmentPreferences,
    } = await import("./appointment.server")
    const { lookupAuthorizedApplicationStatus } =
      await import("./application-status.server")

    const learnerSubmission = await submitLearnerLicenceApplication({
      addressProofType: "MOCK_UTILITY_BILL",
      dateOfBirth: "2000-06-15",
      declarationAccepted: true,
      fullName: "Asha Devi",
      identityProofType: "MOCK_AADHAAR_CARD",
      vehicleClass: "LIGHT_MOTOR_VEHICLE",
      zone: "CENTRAL_DELHI",
    })
    if (learnerSubmission.kind !== "submitted") {
      throw new Error("Expected learner submission")
    }
    await recordSuccessfulPayment(
      learnerSubmission.applicationNumber,
      "00000000-0000-4000-8000-000000000c01",
      "00000000-0000-4000-8000-000000000c02"
    )

    const answerKey = getLearnerTestAnswerKey()
    const answers = learnerTestBank.map((question) => {
      const answer = answerKey.get(question.id)
      if (answer === undefined) throw new Error("Missing learner answer")
      return answer
    })
    const testResult = await submitLearnerTest({
      answers,
      idempotencyKey: "00000000-0000-4000-8000-000000000c03",
      language: "ENGLISH",
    })
    expect(testResult).toMatchObject({ kind: "graded", passed: true })

    const passedAt = new Date(Date.now() - 31 * 24 * 60 * 60_000)
    await prisma.application.update({
      where: { applicationNumber: learnerSubmission.applicationNumber },
      data: { updatedAt: passedAt },
    })
    const permanentSubmission = await submitPermanentLicenceApplication({
      idempotencyKey: "00000000-0000-4000-8000-000000000c04",
      vehicleClass: "LIGHT_MOTOR_VEHICLE",
    })
    if (permanentSubmission.kind !== "submitted") {
      throw new Error("Expected permanent submission")
    }
    await recordSuccessfulPayment(
      permanentSubmission.applicationNumber,
      "00000000-0000-4000-8000-000000000c05",
      "00000000-0000-4000-8000-000000000c06"
    )

    await expect(
      saveAppointmentPreferences({
        applicationNumber: permanentSubmission.applicationNumber,
        idempotencyKey: "00000000-0000-4000-8000-000000000c07",
        notificationChannels: ["SMS", "EMAIL"],
        zones: ["CENTRAL_DELHI", "EAST_DELHI"],
      })
    ).resolves.toMatchObject({ kind: "saved" })
    await prisma.appointmentSlot.create({
      data: {
        endsAt: new Date(Date.now() + 26 * 60 * 60_000),
        inventoryKey: "primary-journey-central-lmv-001",
        startsAt: new Date(Date.now() + 25 * 60 * 60_000),
        vehicleClass: "LIGHT_MOTOR_VEHICLE",
        zone: "CENTRAL_DELHI",
      },
    })
    await expect(allocateAvailableAppointmentOffers()).resolves.toMatchObject({
      offeredCount: 1,
    })

    const journey = await readAppointmentJourney(
      permanentSubmission.applicationNumber
    )
    if (journey.kind !== "found" || !journey.offer) {
      throw new Error("Expected appointment offer")
    }
    await expect(
      acceptAppointmentOffer({
        applicationNumber: permanentSubmission.applicationNumber,
        idempotencyKey: "00000000-0000-4000-8000-000000000c08",
        offerId: journey.offer.id,
      })
    ).resolves.toMatchObject({ kind: "confirmed" })

    const status = await lookupAuthorizedApplicationStatus(
      permanentSubmission.applicationNumber
    )
    expect(status).toMatchObject({
      application: { status: { code: "APPOINTMENT_CONFIRMED" } },
      appointment: { state: "CONFIRMED" },
      blockingReason: null,
      kind: "found",
      payment: { amountPaise: 20_000, status: "PAID" },
    })
    await expect(
      prisma.appointmentNotificationDelivery.count({
        where: {
          offer: {
            waitlistEntry: {
              application: {
                applicationNumber: permanentSubmission.applicationNumber,
              },
            },
          },
        },
      })
    ).resolves.toBe(2)
    await expect(
      prisma.confirmedAppointment.count({
        where: {
          application: {
            applicationNumber: permanentSubmission.applicationNumber,
          },
        },
      })
    ).resolves.toBe(1)
  })
})
