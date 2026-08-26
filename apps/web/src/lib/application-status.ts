const applicationStatusLabels: Partial<Record<string, string>> = {
  DOCUMENT_REVIEW: "Document review",
  DOCUMENTS_VERIFIED: "Checks complete",
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
  APPOINTMENT_OFFERED: "Appointment offer available",
  APPOINTMENT_CONFIRMED: "Appointment confirmed",
}

const blockingReasonMessages: Record<string, string> = {
  APPOINTMENT_SLOT_UNAVAILABLE:
    "A suitable appointment slot is not available yet.",
  APPOINTMENT_PREFERENCES_REQUIRED:
    "Choose appointment preferences before joining the waitlist.",
  APPOINTMENT_OFFER_ACTION_REQUIRED:
    "Respond to the appointment offer before its deadline.",
  APPROVAL_REVIEW_PENDING: "DigiLicense is completing the final review.",
  CORRECTION_REQUIRED:
    "DigiLicense needs corrected information before continuing.",
  DOCUMENT_REVIEW_PENDING: "DigiLicense is reviewing the submitted proof.",
  PAYMENT_CONFIRMATION_PENDING: "DigiLicense is confirming the payment record.",
  TEST_RESULT_PENDING: "DigiLicense is recording the test result.",
  WAITING_PERIOD_NOT_MET: "The required waiting period has not finished yet.",
}

function getApplicationStatusLabel(status: string) {
  return (
    applicationStatusLabels[status] ?? status.replaceAll("_", " ").toLowerCase()
  )
}

function getBlockingReasonMessage(reasonCode: string): string {
  return (
    blockingReasonMessages[reasonCode] ??
    "DigiLicense is processing the current application step."
  )
}

export { getApplicationStatusLabel, getBlockingReasonMessage }
