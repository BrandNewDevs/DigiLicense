import "@tanstack/react-start/server-only"

import {
  generateWorkflowOtp,
  hashWorkflowOtp,
  workflowOtpMatches,
} from "./verification-otp.shared"

function generateMobileUpdateOtp(): string {
  return generateWorkflowOtp()
}

function hashMobileUpdateOtp(otp: string): string {
  return hashWorkflowOtp("mobile-update", otp)
}

function otpMatches(expectedHash: string, candidateOtp: string): boolean {
  return workflowOtpMatches("mobile-update", expectedHash, candidateOtp)
}

export { generateMobileUpdateOtp, hashMobileUpdateOtp, otpMatches }
