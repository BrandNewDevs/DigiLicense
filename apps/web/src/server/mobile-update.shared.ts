import "@tanstack/react-start/server-only"

import {
  getMockWorkflowOtp,
  hashWorkflowOtp,
  workflowOtpMatches,
} from "./verification-otp.shared"

function getMockMobileUpdateOtp(): string {
  return getMockWorkflowOtp()
}

function hashMobileUpdateOtp(otp: string): string {
  return hashWorkflowOtp("mobile-update", otp)
}

function otpMatches(expectedHash: string, candidateOtp: string): boolean {
  return workflowOtpMatches("mobile-update", expectedHash, candidateOtp)
}

export { getMockMobileUpdateOtp, hashMobileUpdateOtp, otpMatches }
