CREATE TYPE "MobileChangeVerificationMethod" AS ENUM ('OTP', 'MOCK_AADHAAR');

CREATE TYPE "MobileChangeStatus" AS ENUM (
  'OTP_PENDING',
  'AADHAAR_PENDING',
  'COMPLETED',
  'FAILED',
  'LOCKED',
  'EXPIRED',
  'CANCELLED'
);

CREATE TYPE "MockAadhaarVerificationStatus" AS ENUM ('PENDING', 'PASSED', 'FAILED');

CREATE TABLE "ApplicantAccount" (
  "id" TEXT NOT NULL,
  "mobileHmac" TEXT NOT NULL,
  "mobileLastFour" TEXT NOT NULL,
  "authVersion" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ApplicantAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ApplicantAccount_mobileHmac_key" ON "ApplicantAccount"("mobileHmac");
CREATE INDEX "ApplicantAccount_updatedAt_idx" ON "ApplicantAccount"("updatedAt");

CREATE TABLE "MobileChangeRequest" (
  "id" TEXT NOT NULL,
  "applicantId" TEXT NOT NULL,
  "targetMobileHmac" TEXT NOT NULL,
  "targetMobileLastFour" TEXT NOT NULL,
  "method" "MobileChangeVerificationMethod" NOT NULL,
  "status" "MobileChangeStatus" NOT NULL,
  "startIdempotencyKey" TEXT NOT NULL,
  "confirmationIdempotencyKey" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MobileChangeRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MobileChangeRequest_startIdempotencyKey_key"
ON "MobileChangeRequest"("startIdempotencyKey");

CREATE UNIQUE INDEX "MobileChangeRequest_confirmationIdempotencyKey_key"
ON "MobileChangeRequest"("confirmationIdempotencyKey");

CREATE UNIQUE INDEX "MobileChangeRequest_one_active_per_applicant_key"
ON "MobileChangeRequest"("applicantId")
WHERE "status" IN ('OTP_PENDING', 'AADHAAR_PENDING');

CREATE INDEX "MobileChangeRequest_applicantId_updatedAt_idx"
ON "MobileChangeRequest"("applicantId", "updatedAt");

CREATE INDEX "MobileChangeRequest_expiresAt_idx"
ON "MobileChangeRequest"("expiresAt");

CREATE TABLE "MobileChangeOtpChallenge" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MobileChangeOtpChallenge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MobileChangeOtpChallenge_requestId_key"
ON "MobileChangeOtpChallenge"("requestId");

CREATE INDEX "MobileChangeOtpChallenge_expiresAt_idx"
ON "MobileChangeOtpChallenge"("expiresAt");

CREATE TABLE "MockAadhaarVerification" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "status" "MockAadhaarVerificationStatus" NOT NULL DEFAULT 'PENDING',
  "reasonCode" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MockAadhaarVerification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MockAadhaarVerification_requestId_key"
ON "MockAadhaarVerification"("requestId");

ALTER TABLE "MobileChangeOtpChallenge"
ADD CONSTRAINT "MobileChangeOtpChallenge_requestId_fkey"
FOREIGN KEY ("requestId") REFERENCES "MobileChangeRequest"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MockAadhaarVerification"
ADD CONSTRAINT "MockAadhaarVerification_requestId_fkey"
FOREIGN KEY ("requestId") REFERENCES "MobileChangeRequest"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
