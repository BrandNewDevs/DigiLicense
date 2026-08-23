-- ApplicationDraft stores temporary applicant form data. Keep it for seven
-- days after the latest form-payload save, then remove it through the
-- scheduled purge command.
ALTER TABLE "ApplicationDraft"
ADD COLUMN "expiresAt" TIMESTAMP(3);

UPDATE "ApplicationDraft"
SET "expiresAt" = CURRENT_TIMESTAMP + INTERVAL '7 days'
WHERE "expiresAt" IS NULL;

ALTER TABLE "ApplicationDraft"
ALTER COLUMN "expiresAt" SET NOT NULL,
ALTER COLUMN "expiresAt" SET DEFAULT (CURRENT_TIMESTAMP + INTERVAL '7 days');

CREATE INDEX "ApplicationDraft_expiresAt_idx" ON "ApplicationDraft"("expiresAt");

-- The database owns the retention deadline. A caller cannot choose a longer
-- deadline when creating a draft, and only saving form data renews it.
CREATE FUNCTION "refreshApplicationDraftExpiry"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW."expiresAt" := CURRENT_TIMESTAMP + INTERVAL '7 days';
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ApplicationDraft_refresh_expiry"
BEFORE UPDATE OF "formPayload" ON "ApplicationDraft"
FOR EACH ROW
EXECUTE FUNCTION "refreshApplicationDraftExpiry"();

CREATE TRIGGER "ApplicationDraft_set_expiry"
BEFORE INSERT ON "ApplicationDraft"
FOR EACH ROW
EXECUTE FUNCTION "refreshApplicationDraftExpiry"();
