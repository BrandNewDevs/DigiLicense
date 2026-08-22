const operatorActions = {
  VERIFY_DOCUMENTS: {
    from: "DOCUMENT_REVIEW",
    to: "DOCUMENTS_VERIFIED",
    label: "Mark mock documents verified",
    nextAction: "Continue to the simulated fee and payment step.",
    eventTitle: "Mock documents verified",
    reasonCode: "SYNTHETIC_DOCUMENT_CHECK",
  },
  REQUEST_CORRECTION: {
    from: "DOCUMENT_REVIEW",
    to: "CORRECTION_REQUIRED",
    label: "Request a simulated correction",
    nextAction:
      "Review the correction request and update the synthetic documents.",
    eventTitle: "Simulated correction requested",
    reasonCode: "SYNTHETIC_CORRECTION_REQUIRED",
  },
  CONFIRM_PAYMENT: {
    from: "PAYMENT_REVIEW",
    to: "PAYMENT_CONFIRMED",
    label: "Confirm simulated payment",
    nextAction: "Wait for the next mock application review.",
    eventTitle: "Simulated payment confirmed",
    reasonCode: "SYNTHETIC_PAYMENT_RECONCILED",
  },
  RECORD_TEST_PASS: {
    from: "TEST_PENDING",
    to: "TEST_PASSED",
    label: "Record simulated test pass",
    nextAction: "Continue to the next synthetic licence step.",
    eventTitle: "Simulated learner test passed",
    reasonCode: "SYNTHETIC_TEST_RESULT",
  },
  RECORD_TEST_FAIL: {
    from: "TEST_PENDING",
    to: "TEST_FAILED",
    label: "Record simulated test fail",
    nextAction: "Choose a mock retest date when eligible.",
    eventTitle: "Simulated learner test not passed",
    reasonCode: "SYNTHETIC_TEST_RESULT",
  },
  APPROVE_APPLICATION: {
    from: "APPROVAL_PENDING",
    to: "APPROVED",
    label: "Approve synthetic application",
    nextAction: "No applicant action is required in this prototype.",
    eventTitle: "Synthetic application approved",
    reasonCode: "SYNTHETIC_APPROVAL",
  },
  REJECT_APPLICATION: {
    from: "APPROVAL_PENDING",
    to: "REJECTED",
    label: "Reject synthetic application",
    nextAction: "Read the mock decision reason and start a new demo if needed.",
    eventTitle: "Synthetic application rejected",
    reasonCode: "SYNTHETIC_REJECTION",
  },
} as const

type OperatorAction = keyof typeof operatorActions

const statusLabels: Partial<Record<string, string>> = {
  DOCUMENT_REVIEW: "Document review",
  DOCUMENTS_VERIFIED: "Documents verified",
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

function getActionsForStatus(status: string) {
  return Object.entries(operatorActions)
    .filter(([, action]) => action.from === status)
    .map(([id, action]) => ({ id: id as OperatorAction, label: action.label }))
}

function getStatusLabel(status: string) {
  return statusLabels[status] ?? status.replaceAll("_", " ").toLowerCase()
}

export { getActionsForStatus, getStatusLabel, operatorActions }
export type { OperatorAction }
