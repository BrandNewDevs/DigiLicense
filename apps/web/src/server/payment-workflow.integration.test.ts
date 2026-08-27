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

async function createPaymentApplication(input?: {
  applicant?: "a" | "b"
  applicationNumber?: string
  service?: string
}): Promise<string> {
  const { prisma } = await import("@digilicense/db/server")
  const applicationNumber =
    input?.applicationNumber ?? "DLINTPAYMENTFOUNDATION001"
  await prisma.application.create({
    data: {
      applicantId: getIntegrationApplicantId(input?.applicant ?? "a"),
      applicationNumber,
      blockingReasonCode: "PAYMENT_CONFIRMATION_PENDING",
      nextAction: "Record a payment outcome.",
      service: input?.service ?? "Learner's licence",
      status: "PAYMENT_REVIEW",
    },
  })
  return applicationNumber
}

describe.sequential("PostgreSQL payment workflow foundation", () => {
  beforeEach(async () => {
    await resetAndSeedIntegrationDatabase()
    authenticatedApplicant = getIntegrationApplicantId("a")
  })

  afterEach(() => {
    authenticatedApplicant = null
  })

  it("derives the amount from the catalogue and isolates applicant records", async () => {
    const { prisma } = await import("@digilicense/db/server")
    const { readApplicationPayment, startApplicationPayment } =
      await import("./payment.server")
    const applicationNumber = await createPaymentApplication()
    const otherApplicationNumber = await createPaymentApplication({
      applicant: "b",
      applicationNumber: "DLINTPAYMENTFOUNDATION002",
    })

    const started = await startApplicationPayment({
      applicationNumber,
      idempotencyKey: "00000000-0000-4000-8000-000000000901",
    })
    expect(started).toMatchObject({
      kind: "started",
      payment: {
        amountPaise: 15_000,
        catalogueCode: "DL-FEE-LEARNER",
        catalogueVersion: "integration-v1",
        status: "PENDING",
      },
    })

    const stored = await prisma.paymentRecord.findFirstOrThrow({
      where: { application: { applicationNumber } },
    })
    expect(stored.amountPaise).toBe(15_000)
    expect(stored.isSimulated).toBe(true)
    expect(stored.feeLines).not.toContain("applicant")

    await expect(
      readApplicationPayment({ applicationNumber: otherApplicationNumber })
    ).resolves.toMatchObject({ kind: "not-found" })
    await expect(
      startApplicationPayment({
        applicationNumber: otherApplicationNumber,
        idempotencyKey: "00000000-0000-4000-8000-000000000902",
      })
    ).resolves.toMatchObject({ kind: "not-found" })
  })

  it("makes starts and successful resolution idempotent under concurrency", async () => {
    const { prisma } = await import("@digilicense/db/server")
    const { resolveApplicationPayment, startApplicationPayment } =
      await import("./payment.server")
    const { lookupAuthorizedApplicationStatus } =
      await import("./application-status.server")
    const applicationNumber = await createPaymentApplication()
    const startInput = {
      applicationNumber,
      idempotencyKey: "00000000-0000-4000-8000-000000000903",
    }
    const starts = await Promise.all([
      startApplicationPayment(startInput),
      startApplicationPayment(startInput),
    ])
    expect(starts.every((result) => result.kind === "started")).toBe(true)
    const first = starts[0]
    if (first.kind !== "started") throw new Error("Expected payment start")

    const resolveInput = {
      applicationNumber,
      idempotencyKey: "00000000-0000-4000-8000-000000000904",
      outcome: "SUCCESS" as const,
      paymentId: first.payment.id,
    }
    const resolutions = await Promise.all([
      resolveApplicationPayment(resolveInput),
      resolveApplicationPayment(resolveInput),
    ])
    expect(resolutions.every((result) => result.kind === "paid")).toBe(true)
    await expect(
      prisma.paymentRecord.count({
        where: { application: { applicationNumber }, status: "PAID" },
      })
    ).resolves.toBe(1)
    await expect(
      prisma.workflowEvent.count({
        where: {
          application: { applicationNumber },
          title: "Payment recorded",
        },
      })
    ).resolves.toBe(1)
    await expect(
      prisma.auditEvent.count({
        where: {
          application: { applicationNumber },
          action: "RECORD_PAYMENT_SUCCESS",
        },
      })
    ).resolves.toBe(1)

    const status = await lookupAuthorizedApplicationStatus(applicationNumber)
    expect(status).toMatchObject({
      application: { status: { code: "DOCUMENTS_VERIFIED" } },
      kind: "found",
      payment: {
        amountPaise: 15_000,
        catalogueCode: "DL-FEE-LEARNER",
        status: "PAID",
      },
    })
  })

  it("opens permanent appointment preferences only after payment", async () => {
    const { resolveApplicationPayment, startApplicationPayment } =
      await import("./payment.server")
    const applicationNumber = await createPaymentApplication({
      applicationNumber: "DLINTPAYMENTPERMANENT001",
      service: "Permanent driving licence",
    })
    const started = await startApplicationPayment({
      applicationNumber,
      idempotencyKey: "00000000-0000-4000-8000-000000000908",
    })
    if (started.kind !== "started") throw new Error("Expected payment start")
    await expect(
      resolveApplicationPayment({
        applicationNumber,
        idempotencyKey: "00000000-0000-4000-8000-000000000909",
        outcome: "SUCCESS",
        paymentId: started.payment.id,
      })
    ).resolves.toMatchObject({
      applicationStatus: "WAITLISTED",
      kind: "paid",
    })
  })

  it("records failure durably and permits a fresh retry", async () => {
    const { prisma } = await import("@digilicense/db/server")
    const { resolveApplicationPayment, startApplicationPayment } =
      await import("./payment.server")
    const applicationNumber = await createPaymentApplication()
    const started = await startApplicationPayment({
      applicationNumber,
      idempotencyKey: "00000000-0000-4000-8000-000000000905",
    })
    if (started.kind !== "started") throw new Error("Expected payment start")

    const failed = await resolveApplicationPayment({
      applicationNumber,
      idempotencyKey: "00000000-0000-4000-8000-000000000906",
      outcome: "FAILURE",
      paymentId: started.payment.id,
    })
    expect(failed).toMatchObject({
      applicationStatus: "PAYMENT_REVIEW",
      kind: "failed",
      payment: { status: "FAILED" },
    })

    const retry = await startApplicationPayment({
      applicationNumber,
      idempotencyKey: "00000000-0000-4000-8000-000000000907",
    })
    expect(retry).toMatchObject({
      kind: "started",
      payment: { status: "PENDING" },
    })
    await expect(
      prisma.paymentRecord.count({
        where: { application: { applicationNumber } },
      })
    ).resolves.toBe(2)
  })
})
