-- Accept client-generated idempotency keys so retried test submissions
-- return the stored graded result instead of recording a second attempt.
-- Uniqueness is scoped per application: a key from another applicant can
-- never match, so replays cannot leak other applicants' results.

ALTER TABLE "LearnerTestAttempt" ADD COLUMN "idempotencyKey" TEXT;

-- Backfill any rows created before the column existed so the NOT NULL
-- constraint below can be enforced.
UPDATE "LearnerTestAttempt"
SET "idempotencyKey" = gen_random_uuid()::text
WHERE "idempotencyKey" IS NULL;

ALTER TABLE "LearnerTestAttempt" ALTER COLUMN "idempotencyKey" SET NOT NULL;

CREATE UNIQUE INDEX "LearnerTestAttempt_applicationId_idempotencyKey_key"
ON "LearnerTestAttempt"("applicationId" ASC, "idempotencyKey" ASC);
