import "@tanstack/react-start/server-only"

export { prisma } from "./db.ts"
export { Prisma } from "./generated/prisma/client.ts"
export {
  MobileChangeStatus,
  MobileChangeVerificationMethod,
  MockAadhaarVerificationStatus,
  WorkflowActor,
} from "./generated/prisma/enums.ts"
export type { ApplicationStatus } from "./generated/prisma/enums.ts"
export {
  hashMobileNumber,
  normalizeMobileNumber,
} from "./mobile-identity.ts"
