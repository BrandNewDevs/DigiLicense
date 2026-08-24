const applicationStatusLabels: Partial<Record<string, string>> = {
  DOCUMENT_REVIEW: "Document review",
  DOCUMENTS_VERIFIED: "Simulated checks complete",
  CORRECTION_REQUIRED: "Correction required",
  PAYMENT_REVIEW: "Payment review",
  PAYMENT_CONFIRMED: "Payment confirmed",
  TEST_PENDING: "Test result pending",
  TEST_PASSED: "Test passed",
  TEST_FAILED: "Test not passed",
  APPROVAL_PENDING: "Approval pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  WAITLISTED: "On appointment waitlist",
}

function getApplicationStatusLabel(status: string) {
  return (
    applicationStatusLabels[status] ?? status.replaceAll("_", " ").toLowerCase()
  )
}

export { getApplicationStatusLabel }
