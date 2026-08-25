CREATE TYPE "MockAddressProofType" AS ENUM (
  'MOCK_AADHAAR_ADDRESS_PROOF',
  'MOCK_RENTAL_AGREEMENT',
  'MOCK_UTILITY_BILL'
);

CREATE TYPE "AddressChangeVerificationStatus" AS ENUM (
  'OTP_PENDING',
  'OTP_VERIFIED',
  'LOCKED',
  'EXPIRED',
  'CONSUMED',
  'CANCELLED'
);

CREATE TABLE "DrivingLicenceRecord" (
  "id" TEXT NOT NULL,
  "applicantId" TEXT NOT NULL,
  "licenceNumber" TEXT NOT NULL,
  "currentAddressSummary" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DrivingLicenceRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DrivingLicenceRecord_licenceNumber_key"
ON "DrivingLicenceRecord"("licenceNumber");
CREATE INDEX "DrivingLicenceRecord_applicantId_licenceNumber_idx"
ON "DrivingLicenceRecord"("applicantId", "licenceNumber");

ALTER TABLE "DrivingLicenceRecord"
ADD CONSTRAINT "DrivingLicenceRecord_applicantId_fkey"
FOREIGN KEY ("applicantId") REFERENCES "ApplicantAccount"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "AddressChangeVerification" (
  "id" TEXT NOT NULL,
  "applicantId" TEXT NOT NULL,
  "licenceRecordId" TEXT NOT NULL,
  "status" "AddressChangeVerificationStatus" NOT NULL,
  "startIdempotencyKey" TEXT NOT NULL,
  "verificationIdempotencyKey" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "verifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AddressChangeVerification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AddressChangeVerification_startIdempotencyKey_key"
ON "AddressChangeVerification"("startIdempotencyKey");
CREATE UNIQUE INDEX "AddressChangeVerification_verificationIdempotencyKey_key"
ON "AddressChangeVerification"("verificationIdempotencyKey");
CREATE UNIQUE INDEX "AddressChangeVerification_one_active_per_applicant_key"
ON "AddressChangeVerification"("applicantId")
WHERE "status" IN ('OTP_PENDING', 'OTP_VERIFIED');
CREATE INDEX "AddressChangeVerification_applicantId_updatedAt_idx"
ON "AddressChangeVerification"("applicantId", "updatedAt");
CREATE INDEX "AddressChangeVerification_expiresAt_idx"
ON "AddressChangeVerification"("expiresAt");

ALTER TABLE "AddressChangeVerification"
ADD CONSTRAINT "AddressChangeVerification_applicantId_fkey"
FOREIGN KEY ("applicantId") REFERENCES "ApplicantAccount"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AddressChangeVerification"
ADD CONSTRAINT "AddressChangeVerification_licenceRecordId_fkey"
FOREIGN KEY ("licenceRecordId") REFERENCES "DrivingLicenceRecord"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "AddressChangeOtpChallenge" (
  "id" TEXT NOT NULL,
  "verificationId" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AddressChangeOtpChallenge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AddressChangeOtpChallenge_verificationId_key"
ON "AddressChangeOtpChallenge"("verificationId");
CREATE INDEX "AddressChangeOtpChallenge_expiresAt_idx"
ON "AddressChangeOtpChallenge"("expiresAt");

ALTER TABLE "AddressChangeOtpChallenge"
ADD CONSTRAINT "AddressChangeOtpChallenge_verificationId_fkey"
FOREIGN KEY ("verificationId") REFERENCES "AddressChangeVerification"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AddressChangeDetail" (
  "id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "licenceRecordId" TEXT NOT NULL,
  "proofType" "MockAddressProofType" NOT NULL,
  "addressLine1" TEXT NOT NULL,
  "addressLine2" TEXT,
  "locality" TEXT NOT NULL,
  "pincode" TEXT NOT NULL,
  "submissionIdempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AddressChangeDetail_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AddressChangeDetail_applicationId_key"
ON "AddressChangeDetail"("applicationId");
CREATE UNIQUE INDEX "AddressChangeDetail_submissionIdempotencyKey_key"
ON "AddressChangeDetail"("submissionIdempotencyKey");
CREATE INDEX "AddressChangeDetail_licenceRecordId_createdAt_idx"
ON "AddressChangeDetail"("licenceRecordId", "createdAt");

ALTER TABLE "AddressChangeDetail"
ADD CONSTRAINT "AddressChangeDetail_applicationId_fkey"
FOREIGN KEY ("applicationId") REFERENCES "Application"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AddressChangeDetail"
ADD CONSTRAINT "AddressChangeDetail_licenceRecordId_fkey"
FOREIGN KEY ("licenceRecordId") REFERENCES "DrivingLicenceRecord"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
