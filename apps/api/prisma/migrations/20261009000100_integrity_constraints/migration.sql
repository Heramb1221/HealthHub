-- Integrity rules that Prisma's schema language cannot express.
-- Hand-authored; Prisma does not manage CHECK constraints or triggers.

-- Emails are stored lowercase so uniqueness is case-insensitive.
ALTER TABLE "User" ADD CONSTRAINT "User_email_lowercase_chk" CHECK ("email" = lower("email"));

-- Consent scopes are a fixed set (see apps/api/docs/CONTRACT_DECISIONS.md A5).
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_resourceScope_chk"
  CHECK ("resourceScope" IN ('profile:read', 'prescriptions:read', 'health_history:read', 'medication_schedules:read'));

ALTER TABLE "PrescriptionRecord" ADD CONSTRAINT "PrescriptionRecord_originalSizeBytes_chk" CHECK ("originalSizeBytes" > 0);

ALTER TABLE "PrescriptionVersion" ADD CONSTRAINT "PrescriptionVersion_versionNumber_chk" CHECK ("versionNumber" >= 1);
ALTER TABLE "PrescriptionVersion" ADD CONSTRAINT "PrescriptionVersion_extractionConfidence_chk"
  CHECK ("extractionConfidence" IS NULL OR ("extractionConfidence" >= 0 AND "extractionConfidence" <= 1));

ALTER TABLE "PrescriptionMedication" ADD CONSTRAINT "PrescriptionMedication_confidence_chk"
  CHECK ("confidence" >= 0 AND "confidence" <= 1);

ALTER TABLE "AvailabilitySlot" ADD CONSTRAINT "AvailabilitySlot_endsAt_chk" CHECK ("endsAt" > "startsAt");

-- A confirmed appointment holds its slot; any other status holds nothing.
-- Together with the unique index on "activeSlotId" this makes double booking
-- impossible at the database level.
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_active_slot_chk" CHECK (
  ("status" = 'confirmed' AND "activeSlotId" IS NOT NULL AND "activeSlotId" = "slotId")
  OR ("status" <> 'confirmed' AND "activeSlotId" IS NULL)
);

-- Append-only tables: audit history and prescription version history can never
-- be edited or deleted, even by a bug in application code.
CREATE FUNCTION "forbid_modification"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "AuditEvent_append_only" BEFORE UPDATE OR DELETE ON "AuditEvent"
  FOR EACH ROW EXECUTE FUNCTION "forbid_modification"();
CREATE TRIGGER "AuditEvent_no_truncate" BEFORE TRUNCATE ON "AuditEvent"
  FOR EACH STATEMENT EXECUTE FUNCTION "forbid_modification"();

CREATE TRIGGER "PrescriptionVersion_append_only" BEFORE UPDATE OR DELETE ON "PrescriptionVersion"
  FOR EACH ROW EXECUTE FUNCTION "forbid_modification"();

CREATE TRIGGER "PrescriptionMedication_append_only" BEFORE UPDATE OR DELETE ON "PrescriptionMedication"
  FOR EACH ROW EXECUTE FUNCTION "forbid_modification"();

-- The original uploaded file reference is written once. Status columns may
-- still change; the original* columns may not.
CREATE FUNCTION "forbid_original_file_change"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."originalStorageKey" IS DISTINCT FROM OLD."originalStorageKey"
     OR NEW."originalFileName" IS DISTINCT FROM OLD."originalFileName"
     OR NEW."originalMimeType" IS DISTINCT FROM OLD."originalMimeType"
     OR NEW."originalSizeBytes" IS DISTINCT FROM OLD."originalSizeBytes"
     OR NEW."originalSha256" IS DISTINCT FROM OLD."originalSha256" THEN
    RAISE EXCEPTION 'original prescription file reference is immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "PrescriptionRecord_original_immutable" BEFORE UPDATE ON "PrescriptionRecord"
  FOR EACH ROW EXECUTE FUNCTION "forbid_original_file_change"();
