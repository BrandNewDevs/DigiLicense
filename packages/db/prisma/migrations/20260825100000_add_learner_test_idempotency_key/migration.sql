-- Accept client-generated idempotency keys so retried test submissions
-- return the stored graded result instead of recording a second attempt.
ALTER TABLE "LearnerTestAttempt" ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "LearnerTestAttempt_idempotencyKey_key" ON "LearnerTestAttempt"("idempotencyKey");
