-- Persist learner's-test attempts so results, retests, and history are
-- reproducible from stored question identifiers and answers.

-- CreateEnum
CREATE TYPE "TestLanguage" AS ENUM ('ENGLISH', 'HINDI');

-- CreateTable
CREATE TABLE "LearnerTestAttempt" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "language" "TestLanguage" NOT NULL,
    "questionIds" TEXT NOT NULL,
    "answers" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "isSimulated" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearnerTestAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LearnerTestAttempt_applicationId_createdAt_idx" ON "LearnerTestAttempt"("applicationId" ASC, "createdAt" ASC);

-- AddForeignKey
ALTER TABLE "LearnerTestAttempt" ADD CONSTRAINT "LearnerTestAttempt_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
