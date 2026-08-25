type AddressChangeVerificationTerminalStatus =
  | "CANCELLED"
  | "CONSUMED"
  | "EXPIRED"
  | "LOCKED"

type AddressChangeVerificationTerminalResult =
  | { kind: "otp-locked"; message: string }
  | { kind: "verification-cancelled"; message: string }
  | { kind: "verification-consumed"; message: string }
  | { kind: "verification-expired"; message: string }

function getAddressChangeVerificationTerminalResult(
  status: AddressChangeVerificationTerminalStatus
): AddressChangeVerificationTerminalResult {
  switch (status) {
    case "LOCKED":
      return {
        kind: "otp-locked",
        message: "Too many OTP attempts. Start a new request later.",
      }
    case "CONSUMED":
      return {
        kind: "verification-consumed",
        message: "This verification was already used to submit an application.",
      }
    case "CANCELLED":
      return {
        kind: "verification-cancelled",
        message:
          "This verification request was cancelled. Start a new request.",
      }
    case "EXPIRED":
      return {
        kind: "verification-expired",
        message: "This verification request expired. Start a new request.",
      }
  }
}

export { getAddressChangeVerificationTerminalResult }
export type {
  AddressChangeVerificationTerminalResult,
  AddressChangeVerificationTerminalStatus,
}
