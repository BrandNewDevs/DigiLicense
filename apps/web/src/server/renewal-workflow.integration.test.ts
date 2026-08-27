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

describe.sequential("PostgreSQL renewal workflow", () => {
  beforeEach(async () => {
    await resetAndSeedIntegrationDatabase()
    authenticatedApplicant = getIntegrationApplicantId("a")
  })

  afterEach(() => {
    authenticatedApplicant = null
  })

  it("persists an owned renewal and completes it atomically after payment", async () => {
    const { prisma } = await import("@digilicense/db/server")
    const { readRenewalState, submitRenewalApplication } =
      await import("./renewal.server")
    const { resolveApplicationPayment, startApplicationPayment } =
      await import("./payment.server")
    const initial = await readRenewalState()
    expect(initial.kind).toBe("ready")
    if (initial.kind !== "ready") throw new Error("Expected renewal state")
    const licence = initial.licences[0]
    expect(licence.eligibility.kind).toBe("eligible")

    const submission = await submitRenewalApplication({
      declarationAccepted: true,
      idempotencyKey: "00000000-0000-4000-8000-000000000a01",
      licenceRecordId: licence.id,
      reason: "EXPIRING_SOON",
    })
    expect(submission.kind).toBe("submitted")
    if (submission.kind !== "submitted") throw new Error("Expected submission")
    const replay = await submitRenewalApplication({
      declarationAccepted: true,
      idempotencyKey: "00000000-0000-4000-8000-000000000a01",
      licenceRecordId: licence.id,
      reason: "EXPIRING_SOON",
    })
    expect(replay).toMatchObject({
      applicationNumber: submission.applicationNumber,
      kind: "submitted",
    })

    const payment = await startApplicationPayment({
      applicationNumber: submission.applicationNumber,
      idempotencyKey: "00000000-0000-4000-8000-000000000a02",
    })
    if (payment.kind !== "started") throw new Error("Expected payment start")
    await expect(
      resolveApplicationPayment({
        applicationNumber: submission.applicationNumber,
        idempotencyKey: "00000000-0000-4000-8000-000000000a03",
        outcome: "SUCCESS",
        paymentId: payment.payment.id,
      })
    ).resolves.toMatchObject({ applicationStatus: "APPROVED", kind: "paid" })

    const completed = await prisma.application.findUniqueOrThrow({
      where: { applicationNumber: submission.applicationNumber },
      include: {
        auditEvents: true,
        notifications: true,
        renewalDetail: true,
        workflowEvents: true,
      },
    })
    const renewedLicence = await prisma.drivingLicenceRecord.findUniqueOrThrow({
      where: { id: licence.id },
    })
    expect(completed.status).toBe("APPROVED")
    expect(completed.blockingReasonCode).toBeNull()
    expect(completed.renewalDetail?.renewedValidUntil?.toISOString()).toBe(
      renewedLicence.validUntil.toISOString()
    )
    expect(renewedLicence.version).toBe(2)
    expect(renewedLicence.lastRenewedAt).not.toBeNull()
    expect(completed.workflowEvents).toHaveLength(4)
    expect(completed.notifications).toHaveLength(2)
    expect(completed.auditEvents).toHaveLength(4)
  })

  it("uses generic ownership failure and rejects dates outside the window", async () => {
    const { prisma } = await import("@digilicense/db/server")
    const { submitRenewalApplication } = await import("./renewal.server")
    const licence = await prisma.drivingLicenceRecord.findUniqueOrThrow({
      where: { licenceNumber: integrationApplicants.a.licenceNumber },
    })

    authenticatedApplicant = getIntegrationApplicantId("b")
    await expect(
      submitRenewalApplication({
        declarationAccepted: true,
        idempotencyKey: "00000000-0000-4000-8000-000000000a04",
        licenceRecordId: licence.id,
        reason: "EXPIRING_SOON",
      })
    ).resolves.toMatchObject({ kind: "licence-not-found" })

    authenticatedApplicant = getIntegrationApplicantId("a")
    await prisma.drivingLicenceRecord.update({
      where: { id: licence.id },
      data: { validUntil: new Date(Date.now() + 2 * 365 * 24 * 60 * 60_000) },
    })
    await expect(
      submitRenewalApplication({
        declarationAccepted: true,
        idempotencyKey: "00000000-0000-4000-8000-000000000a05",
        licenceRecordId: licence.id,
        reason: "EXPIRING_SOON",
      })
    ).resolves.toMatchObject({ kind: "ineligible" })
    await expect(
      prisma.application.count({
        where: { service: "Driving-licence renewal" },
      })
    ).resolves.toBe(0)
  })

  it("serializes competing submissions to one active renewal", async () => {
    const { prisma } = await import("@digilicense/db/server")
    const { submitRenewalApplication } = await import("./renewal.server")
    const licence = await prisma.drivingLicenceRecord.findUniqueOrThrow({
      where: { licenceNumber: integrationApplicants.a.licenceNumber },
    })
    const outcomes = await Promise.all([
      submitRenewalApplication({
        declarationAccepted: true,
        idempotencyKey: "00000000-0000-4000-8000-000000000a06",
        licenceRecordId: licence.id,
        reason: "EXPIRING_SOON",
      }),
      submitRenewalApplication({
        declarationAccepted: true,
        idempotencyKey: "00000000-0000-4000-8000-000000000a07",
        licenceRecordId: licence.id,
        reason: "EXPIRING_SOON",
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
