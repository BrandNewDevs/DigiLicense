const operatorActions = {
  VERIFY_DOCUMENTS: {
    from: "DOCUMENT_REVIEW",
    to: "DOCUMENTS_VERIFIED",
    label: "Mark mock documents verified",
    nextAction: "Continue to the simulated fee and payment step.",
    eventTitle: "Mock documents verified",
    reasonCode: "SYNTHETIC_DOCUMENT_CHECK",
    decisionReasons: [
      {
        code: "DOCUMENTS_MATCH_CHECKLIST",
        label: "Documents matched the synthetic checklist",
      },
      {
        code: "DOCUMENTS_LEGIBLE",
        label: "All required synthetic fields were legible",
      },
    ],
  },
  REQUEST_CORRECTION: {
    from: "DOCUMENT_REVIEW",
    to: "CORRECTION_REQUIRED",
    label: "Request a simulated correction",
    nextAction:
      "Review the correction request and update the synthetic documents.",
    eventTitle: "Simulated correction requested",
    reasonCode: "SYNTHETIC_CORRECTION_REQUIRED",
    decisionReasons: [
      {
        code: "PHOTO_MISMATCH",
        label: "Photo did not match the synthetic applicant record",
      },
      {
        code: "DETAILS_INCOMPLETE",
        label: "Required synthetic details were incomplete",
      },
      {
        code: "DOCUMENT_EXPIRED",
        label: "A supporting mock document was expired",
      },
    ],
  },
  CONFIRM_PAYMENT: {
    from: "PAYMENT_REVIEW",
    to: "PAYMENT_CONFIRMED",
    label: "Confirm simulated payment",
    nextAction: "Wait for the next mock application review.",
    eventTitle: "Simulated payment confirmed",
    reasonCode: "SYNTHETIC_PAYMENT_RECONCILED",
    decisionReasons: [
      {
        code: "FEE_MATCHED",
        label: "Mock fee receipt matched the calculated fee",
      },
      {
        code: "REFERENCE_VERIFIED",
        label: "Payment reference verified against the mock ledger",
      },
    ],
  },
  RECORD_TEST_PASS: {
    from: "TEST_PENDING",
    to: "TEST_PASSED",
    label: "Record simulated test pass",
    nextAction: "Continue to the next synthetic licence step.",
    eventTitle: "Simulated learner test passed",
    reasonCode: "SYNTHETIC_TEST_RESULT",
    decisionReasons: [
      {
        code: "EXAMINER_SHEET_PASS",
        label: "Pass recorded from the mock examiner sheet",
      },
    ],
  },
  RECORD_TEST_FAIL: {
    from: "TEST_PENDING",
    to: "TEST_FAILED",
    label: "Record simulated test fail",
    nextAction: "Choose a mock retest date when eligible.",
    eventTitle: "Simulated learner test not passed",
    reasonCode: "SYNTHETIC_TEST_RESULT",
    decisionReasons: [
      {
        code: "EXAMINER_SHEET_FAIL",
        label: "Fail recorded from the mock examiner sheet",
      },
    ],
  },
  APPROVE_APPLICATION: {
    from: "APPROVAL_PENDING",
    to: "APPROVED",
    label: "Approve synthetic application",
    nextAction: "No applicant action is required in this prototype.",
    eventTitle: "Synthetic application approved",
    reasonCode: "SYNTHETIC_APPROVAL",
    decisionReasons: [
      {
        code: "CHECKS_COMPLETE",
        label: "All simulated checks completed",
      },
      {
        code: "ELIGIBILITY_MET",
        label: "Synthetic eligibility criteria met",
      },
    ],
  },
  REJECT_APPLICATION: {
    from: "APPROVAL_PENDING",
    to: "REJECTED",
    label: "Reject synthetic application",
    nextAction: "Read the mock decision reason and start a new demo if needed.",
    eventTitle: "Synthetic application rejected",
    reasonCode: "SYNTHETIC_REJECTION",
    decisionReasons: [
      {
        code: "ELIGIBILITY_NOT_MET",
        label: "Synthetic eligibility criteria not met",
      },
      {
        code: "DUPLICATE_APPLICATION",
        label: "Duplicate synthetic application detected",
      },
    ],
  },
} as const

type OperatorAction = keyof typeof operatorActions

type DecisionReason = {
  code: string
  label: string
}

function getDecisionReasons(action: OperatorAction): readonly DecisionReason[] {
  return operatorActions[action].decisionReasons
}

function getDecisionReasonCodes(action: OperatorAction): string[] {
  return getDecisionReasons(action).map((reason) => reason.code)
}

function getDecisionLabel(
  action: OperatorAction,
  code: string
): string | undefined {
  return operatorActions[action].decisionReasons.find(
    (reason) => reason.code === code
  )?.label
}

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

export {
  getActionsForStatus,
  getDecisionLabel,
  getDecisionReasonCodes,
  getDecisionReasons,
  getStatusLabel,
  operatorActions,
}
export type { DecisionReason, OperatorAction }
