import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  getIntegrationApplicantId,
  integrationApplicants,
  resetAndSeedIntegrationDatabase,
} from "../test/integration-fixtures"
import {
  getLearnerTestAnswerKey,
  learnerTestBank,
} from "./learner-test-bank.server"

let authenticatedApplicant: string | null = null

vi.mock("./demo-session.server", () => ({
  requireApplicant: vi.fn(async () =>
    authenticatedApplicant
      ? { applicantId: authenticatedApplicant, authVersion: 1 }
      : null
  ),
}))

const validLearnerSubmission = {
  addressProofType: "MOCK_UTILITY_BILL" as const,
  dateOfBirth: "2000-06-15",
  declarationAccepted: true as const,
  fullName: "Asha Devi",
  identityProofType: "MOCK_AADHAAR_CARD" as const,
  vehicleClass: "MOTORCYCLE_WITH_GEAR" as const,
  zone: "CENTRAL_DELHI" as const,
}

function correctLearnerTestAnswers(): number[] {
  const answerKey = getLearnerTestAnswerKey()
  return learnerTestBank.map((question) => {
    const answer = answerKey.get(question.id)
    if (answer === undefined) throw new Error("Missing learner-test answer")
    return answer
  })
}

describe.sequential("PostgreSQL learner workflow boundaries", () => {
  beforeEach(async () => {
    await resetAndSeedIntegrationDatabase()
    authenticatedApplicant = getIntegrationApplicantId("a")
  })

  afterEach(() => {
    authenticatedApplicant = null
  })

  it("persists an owned learner application with all workflow records", async () => {
    const { submitLearnerLicenceApplication } =
      await import("./learner-licence.server")
    const { prisma } = await import("@digilicense/db/server")

    const result = await submitLearnerLicenceApplication(validLearnerSubmission)

    expect(result.kind).toBe("submitted")
    if (result.kind !== "submitted") return

    const application = await prisma.application.findUniqueOrThrow({
      where: { applicationNumber: result.applicationNumber },
      include: {
        auditEvents: true,
        documents: true,
        notifications: true,
        workflowEvents: true,
      },
    })

    expect(application.applicantId).toBe(getIntegrationApplicantId("a"))
    expect(application.documents).toHaveLength(3)
    expect(application.workflowEvents).toHaveLength(2)
    expect(application.notifications).toHaveLength(1)
    expect(application.auditEvents).toHaveLength(1)
  })

  it("enforces the active-application guard when submits race", async () => {
    const { submitLearnerLicenceApplication } =
      await import("./learner-licence.server")
    const { prisma } = await import("@digilicense/db/server")

    const outcomes = await Promise.all([
      submitLearnerLicenceApplication(validLearnerSubmission),
      submitLearnerLicenceApplication(validLearnerSubmission),
    ])

    expect(
      outcomes.filter((outcome) => outcome.kind === "submitted")
    ).toHaveLength(1)
    expect(
      outcomes.filter((outcome) => outcome.kind === "duplicate-active")
    ).toHaveLength(1)
    await expect(
      prisma.application.count({
        where: {
          applicantId: getIntegrationApplicantId("a"),
          service: "Learner's licence",
        },
      })
    ).resolves.toBe(1)
  })

  it("does not disclose another applicant's status projection", async () => {
    const { submitLearnerLicenceApplication } =
      await import("./learner-licence.server")
    const { lookupAuthorizedApplicationStatus } =
      await import("./application-status.server")

    authenticatedApplicant = getIntegrationApplicantId("a")
    const result = await submitLearnerLicenceApplication(validLearnerSubmission)
    expect(result.kind).toBe("submitted")
    if (result.kind !== "submitted") return

    authenticatedApplicant = integrationApplicants.b.id
    await expect(
      lookupAuthorizedApplicationStatus(result.applicationNumber)
    ).resolves.toMatchObject({ kind: "not-found" })
  })

  it("locks a mobile OTP challenge durably without recording raw secrets", async () => {
    const { prisma } = await import("@digilicense/db/server")
    const { readMobileUpdateState, startMobileUpdate, verifyMobileUpdateOtp } =
      await import("./mobile-update.server")
    const start = await startMobileUpdate({
      idempotencyKey: "00000000-0000-4000-8000-000000000001",
      method: "OTP",
      targetMobileNumber: "9000000009",
    })
    expect(start.kind).toBe("started")
    if (start.kind !== "started") return
    expect(start.syntheticOtp).toMatch(/^\d{6}$/)

    const replayed = await startMobileUpdate({
      idempotencyKey: "00000000-0000-4000-8000-000000000001",
      method: "OTP",
      targetMobileNumber: "9000000009",
    })
    expect(replayed).toMatchObject({ kind: "started", requestId: start.requestId })
    if (replayed.kind !== "started") return
    expect(replayed.syntheticOtp).toMatch(/^\d{6}$/)

    const reloaded = await readMobileUpdateState()
    expect(reloaded).toMatchObject({
      kind: "ready",
      activeRequest: { id: start.requestId, method: "OTP" },
    })

    const attempts = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        verifyMobileUpdateOtp({
          idempotencyKey: `00000000-0000-4000-8000-0000000001${index}`,
          otp: "000000",
          requestId: start.requestId,
        })
      )
    )
    expect(attempts.some((attempt) => attempt.kind === "otp-locked")).toBe(true)

    const request = await prisma.mobileChangeRequest.findUniqueOrThrow({
      where: { id: start.requestId },
      include: { otpChallenge: true },
    })
    expect(request.status).toBe("LOCKED")
    expect(request.otpChallenge?.attemptCount).toBe(5)
    expect(JSON.stringify(request)).not.toContain("9000000009")
    expect(request.otpChallenge?.codeHash).not.toBe("000000")
    expect("otp" in (request.otpChallenge ?? {})).toBe(false)
  })

  it("automatically completes a due address review exactly once", async () => {
    const { prisma, processDueAddressChangeReviews } =
      await import("@digilicense/db/server")
    const {
      readAddressChangeState,
      startAddressChangeOtp,
      submitAddressChangeApplication,
      verifyAddressChangeOtp,
    } = await import("./address-change.server")
    const licence = await prisma.drivingLicenceRecord.findUniqueOrThrow({
      where: { licenceNumber: integrationApplicants.a.licenceNumber },
    })
    const started = await startAddressChangeOtp({
      idempotencyKey: "00000000-0000-4000-8000-000000000201",
      licenceRecordId: licence.id,
    })
    expect(started.kind).toBe("started")
    if (started.kind !== "started") return
    expect(started.syntheticOtp).toMatch(/^\d{6}$/)
    if (!started.syntheticOtp) return

    const replayed = await startAddressChangeOtp({
      idempotencyKey: "00000000-0000-4000-8000-000000000201",
      licenceRecordId: licence.id,
    })
    expect(replayed).toMatchObject({
      kind: "started",
      verificationId: started.verificationId,
    })
    if (replayed.kind !== "started" || !replayed.syntheticOtp) return

    const reloaded = await readAddressChangeState()
    expect(reloaded).toMatchObject({
      kind: "ready",
      activeVerification: { id: started.verificationId, status: "OTP_PENDING" },
    })

    const verified = await verifyAddressChangeOtp({
      idempotencyKey: "00000000-0000-4000-8000-000000000202",
      otp: replayed.syntheticOtp,
      verificationId: started.verificationId,
    })
    expect(verified.kind).toBe("verified")
    if (verified.kind !== "verified") return

    const submission = await submitAddressChangeApplication({
      addressLine1: "42 Test Street",
      declarationAccepted: true,
      idempotencyKey: "00000000-0000-4000-8000-000000000203",
      locality: "DWARKA",
      pincode: "110075",
      proofType: "MOCK_UTILITY_BILL",
      verificationId: started.verificationId,
    })
    expect(submission.kind).toBe("submitted")
    if (submission.kind !== "submitted") return

    await prisma.application.update({
      where: { applicationNumber: submission.applicationNumber },
      data: { statusDeadlineAt: new Date(Date.now() - 1_000) },
    })
    await Promise.all([
      processDueAddressChangeReviews(),
      processDueAddressChangeReviews(),
    ])

    const application = await prisma.application.findUniqueOrThrow({
      where: { applicationNumber: submission.applicationNumber },
      include: {
        auditEvents: true,
        documents: true,
        notifications: true,
        workflowEvents: true,
      },
    })
    const refreshedLicence =
      await prisma.drivingLicenceRecord.findUniqueOrThrow({
        where: { id: licence.id },
      })
    expect(application.status).toBe("APPROVED")
    expect(application.blockingReasonCode).toBeNull()
    expect(application.statusDeadlineAt).toBeNull()
    expect(application.documents).toHaveLength(1)
    expect(application.documents[0]?.status).toBe("ACCEPTED")
    expect(application.workflowEvents).toHaveLength(3)
    expect(application.notifications).toHaveLength(2)
    expect(application.auditEvents).toHaveLength(2)
    expect(refreshedLicence.currentAddressSummary).toBe("DWARKA, Delhi 110075")
  })

  it("persists the learner-to-confirmed-appointment journey through public workflow functions", async () => {
    const {
      allocateAvailableAppointmentOffers,
      prisma,
    } = await import("@digilicense/db/server")
    const { saveLearnerLicenceDraft, submitLearnerLicenceApplication } =
      await import("./learner-licence.server")
    const { submitLearnerTest } = await import("./learner-test.server")
    const {
      readPermanentLicenceState,
      submitPermanentLicenceApplication,
    } = await import("./permanent-licence.server")
    const {
      acceptAppointmentOffer,
      readAppointmentJourney,
      saveAppointmentPreferences,
    } = await import("./appointment.server")

    await expect(
      saveLearnerLicenceDraft({ payload: validLearnerSubmission })
    ).resolves.toMatchObject({ kind: "saved" })
    const learnerSubmission = await submitLearnerLicenceApplication(
      validLearnerSubmission
    )
    expect(learnerSubmission.kind).toBe("submitted")
    if (learnerSubmission.kind !== "submitted") return

    const learnerTest = await submitLearnerTest({
      answers: correctLearnerTestAnswers(),
      idempotencyKey: "00000000-0000-4000-8000-000000000301",
      language: "ENGLISH",
    })
    expect(learnerTest).toMatchObject({ kind: "graded", passed: true })

    await prisma.application.update({
      where: { applicationNumber: learnerSubmission.applicationNumber },
      data: { updatedAt: new Date(Date.now() - 31 * 24 * 60 * 60_000) },
    })
    await expect(readPermanentLicenceState()).resolves.toMatchObject({
      kind: "eligible",
      learnerApplicationNumber: learnerSubmission.applicationNumber,
      vehicleClass: "MOTORCYCLE_WITH_GEAR",
    })

    const permanentSubmission = await submitPermanentLicenceApplication({
      idempotencyKey: "00000000-0000-4000-8000-000000000302",
      vehicleClass: "MOTORCYCLE_WITH_GEAR",
    })
    expect(permanentSubmission.kind).toBe("submitted")
    if (permanentSubmission.kind !== "submitted") return

    await expect(
      saveAppointmentPreferences({
        applicationNumber: permanentSubmission.applicationNumber,
        idempotencyKey: "00000000-0000-4000-8000-000000000303",
        notificationChannels: ["SMS"],
        zones: ["CENTRAL_DELHI"],
      })
    ).resolves.toMatchObject({ kind: "saved" })
    await prisma.appointmentSlot.create({
      data: {
        endsAt: new Date(Date.now() + 26 * 60 * 60_000),
        inventoryKey: "integration-primary-journey-slot",
        startsAt: new Date(Date.now() + 25 * 60 * 60_000),
        vehicleClass: "MOTORCYCLE_WITH_GEAR",
        zone: "CENTRAL_DELHI",
      },
    })
    await expect(allocateAvailableAppointmentOffers()).resolves.toMatchObject({
      offeredCount: 1,
    })

    const offeredJourney = await readAppointmentJourney(
      permanentSubmission.applicationNumber
    )
    expect(offeredJourney.kind).toBe("found")
    if (offeredJourney.kind !== "found")
      throw new Error("Expected the owned appointment journey to be found")
    expect(offeredJourney.offer).not.toBeNull()
    if (!offeredJourney.offer)
      throw new Error(
        "Expected allocation to create an active appointment offer"
      )

    await expect(
      acceptAppointmentOffer({
        applicationNumber: permanentSubmission.applicationNumber,
        idempotencyKey: "00000000-0000-4000-8000-000000000304",
        offerId: offeredJourney.offer.id,
      })
    ).resolves.toMatchObject({ kind: "confirmed" })

    const application = await prisma.application.findUniqueOrThrow({
      where: { applicationNumber: permanentSubmission.applicationNumber },
      include: {
        auditEvents: true,
        confirmedAppointment: true,
        notifications: true,
        workflowEvents: true,
      },
    })
    expect(application.status).toBe("APPOINTMENT_CONFIRMED")
    expect(application.confirmedAppointment).not.toBeNull()
    expect(application.workflowEvents).toHaveLength(4)
    expect(application.notifications).toHaveLength(3)
    expect(application.auditEvents).toHaveLength(4)
  })

  it("enforces the permanent-licence waiting-period boundary from stored learner results", async () => {
    const { prisma } = await import("@digilicense/db/server")
    const { readPermanentLicenceState } =
      await import("./permanent-licence.server")
    const learner = await prisma.application.create({
      data: {
        applicantId: getIntegrationApplicantId("a"),
        applicationNumber: "DLINTWAITINGBOUNDARY",
        nextAction: "Learner test passed.",
        service: "Learner's licence",
        status: "TEST_PASSED",
        updatedAt: new Date(Date.now() - 29 * 24 * 60 * 60_000),
      },
      select: { id: true },
    })
    await prisma.applicationDraft.create({
      data: {
        applicantId: getIntegrationApplicantId("a"),
        applicationId: learner.id,
        formPayload: JSON.stringify({ vehicleClass: "MOTORCYCLE_WITH_GEAR" }),
        service: "Learner's licence",
      },
    })
    await expect(readPermanentLicenceState()).resolves.toMatchObject({
      kind: "waiting-period",
    })

    await prisma.application.update({
      where: { id: learner.id },
      data: { updatedAt: new Date(Date.now() - 30 * 24 * 60 * 60_000) },
    })
    await expect(readPermanentLicenceState()).resolves.toMatchObject({
      kind: "eligible",
      vehicleClass: "MOTORCYCLE_WITH_GEAR",
    })
  })
})
