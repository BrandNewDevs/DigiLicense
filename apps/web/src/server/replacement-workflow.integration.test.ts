import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  getIntegrationApplicantId,
  integrationApplicants,
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

describe.sequential("PostgreSQL replacement workflow", () => {
  beforeEach(async () => {
    await resetAndSeedIntegrationDatabase()
    authenticatedApplicant = getIntegrationApplicantId("a")
  })

  afterEach(() => {
    authenticatedApplicant = null
  })

  it("records an owned replacement and completes it atomically after payment", async () => {
    const { prisma } = await import("@digilicense/db/server")
    const { lookupAuthorizedApplicationStatus } =
      await import("./application-status.server")
    const { resolveApplicationPayment, startApplicationPayment } =
      await import("./payment.server")
    const { readReplacementState, submitReplacementApplication } =
      await import("./replacement.server")
    const state = await readReplacementState()
    expect(state.kind).toBe("ready")
    if (state.kind !== "ready") throw new Error("Expected replacement state")
    const licence = state.licences[0]

    const submission = await submitReplacementApplication({
      declarationAccepted: true,
      idempotencyKey: "00000000-0000-4000-8000-000000000b01",
      licenceRecordId: licence.id,
      reason: "LOST",
    })
    expect(submission.kind).toBe("submitted")
    if (submission.kind !== "submitted") throw new Error("Expected submission")
    await expect(
      submitReplacementApplication({
        declarationAccepted: true,
        idempotencyKey: "00000000-0000-4000-8000-000000000b01",
        licenceRecordId: licence.id,
        reason: "LOST",
      })
    ).resolves.toMatchObject({
      applicationNumber: submission.applicationNumber,
      kind: "submitted",
    })

    const payment = await startApplicationPayment({
      applicationNumber: submission.applicationNumber,
      idempotencyKey: "00000000-0000-4000-8000-000000000b02",
    })
    if (payment.kind !== "started") throw new Error("Expected payment start")
    await expect(
      resolveApplicationPayment({
        applicationNumber: submission.applicationNumber,
        idempotencyKey: "00000000-0000-4000-8000-000000000b03",
        outcome: "SUCCESS",
        paymentId: payment.payment.id,
      })
    ).resolves.toMatchObject({ applicationStatus: "APPROVED", kind: "paid" })

    const completed = await prisma.application.findUniqueOrThrow({
      where: { applicationNumber: submission.applicationNumber },
      include: {
        auditEvents: true,
        documents: true,
        notifications: true,
        replacementDetail: true,
        workflowEvents: true,
      },
    })
    const refreshedLicence =
      await prisma.drivingLicenceRecord.findUniqueOrThrow({
        where: { id: licence.id },
      })
    expect(completed.status).toBe("APPROVED")
    expect(completed.documents[0]?.status).toBe("ACCEPTED")
    expect(completed.replacementDetail?.replacementReference).toMatch(
      /^DLREPL-\d{4}-[A-F0-9]{12}$/
    )
    expect(refreshedLicence.version).toBe(2)
    expect(refreshedLicence.lastReplacementAt).not.toBeNull()
    expect(completed.workflowEvents).toHaveLength(4)
    expect(completed.notifications).toHaveLength(2)
    expect(completed.auditEvents).toHaveLength(4)

    await expect(
      lookupAuthorizedApplicationStatus(submission.applicationNumber)
    ).resolves.toMatchObject({
      application: { status: { code: "APPROVED" } },
      kind: "found",
      serviceOutcome: {
        kind: "REPLACEMENT",
        replacementReference: completed.replacementDetail?.replacementReference,
      },
    })
  })

  it("does not disclose another applicant's licence", async () => {
    const { prisma } = await import("@digilicense/db/server")
    const { submitReplacementApplication } =
      await import("./replacement.server")
    const licence = await prisma.drivingLicenceRecord.findUniqueOrThrow({
      where: { licenceNumber: integrationApplicants.a.licenceNumber },
    })
    authenticatedApplicant = getIntegrationApplicantId("b")
    await expect(
      submitReplacementApplication({
        declarationAccepted: true,
        idempotencyKey: "00000000-0000-4000-8000-000000000b04",
        licenceRecordId: licence.id,
        reason: "DAMAGED",
      })
    ).resolves.toMatchObject({ kind: "licence-not-found" })
  })

  it("prevents overlap with another active licence-change workflow", async () => {
    const { prisma } = await import("@digilicense/db/server")
    const { submitRenewalApplication } = await import("./renewal.server")
    const { submitReplacementApplication } =
      await import("./replacement.server")
    const licence = await prisma.drivingLicenceRecord.findUniqueOrThrow({
      where: { licenceNumber: integrationApplicants.a.licenceNumber },
    })
    await expect(
      submitRenewalApplication({
        declarationAccepted: true,
        idempotencyKey: "00000000-0000-4000-8000-000000000b05",
        licenceRecordId: licence.id,
        reason: "EXPIRING_SOON",
      })
    ).resolves.toMatchObject({ kind: "submitted" })
    await expect(
      submitReplacementApplication({
        declarationAccepted: true,
        idempotencyKey: "00000000-0000-4000-8000-000000000b06",
        licenceRecordId: licence.id,
        reason: "UNREADABLE",
      })
    ).resolves.toMatchObject({ kind: "licence-busy" })
  })

  it("serializes competing replacement submissions", async () => {
    const { prisma } = await import("@digilicense/db/server")
    const { submitReplacementApplication } =
      await import("./replacement.server")
    const licence = await prisma.drivingLicenceRecord.findUniqueOrThrow({
      where: { licenceNumber: integrationApplicants.a.licenceNumber },
    })
    const outcomes = await Promise.all([
      submitReplacementApplication({
        declarationAccepted: true,
        idempotencyKey: "00000000-0000-4000-8000-000000000b07",
        licenceRecordId: licence.id,
        reason: "DAMAGED",
      }),
      submitReplacementApplication({
        declarationAccepted: true,
        idempotencyKey: "00000000-0000-4000-8000-000000000b08",
        licenceRecordId: licence.id,
        reason: "DAMAGED",
      }),
    ])
    expect(
      outcomes.filter((result) => result.kind === "submitted")
    ).toHaveLength(1)
    expect(
      outcomes.filter((result) => result.kind === "duplicate-active")
    ).toHaveLength(1)
  })
})
