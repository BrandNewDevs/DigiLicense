-- An applicant may hold only one active application per service at a time.
-- Terminal outcomes (approved, rejected) free the pair so a reapplication is
-- possible. The database enforces this even if two submit requests race.

-- Rebalance earlier seeded scenarios across synthetic applicants so every
-- (applicant, service) pair satisfies the rule below. The primary demo
-- applicant keeps a clean learner's-licence slate for the guided flow.
UPDATE "Application"
SET "applicantId" = 'demo-applicant-002'
WHERE "applicationNumber" IN ('DLDEMO20260001', 'DLDEMO20260003');

UPDATE "Application"
SET "applicantId" = 'demo-applicant-003'
WHERE "applicationNumber" = 'DLDEMO20260002';

CREATE UNIQUE INDEX "Application_active_applicant_service_key"
ON "Application"("applicantId", "service")
WHERE "status" NOT IN ('REJECTED', 'APPROVED');
