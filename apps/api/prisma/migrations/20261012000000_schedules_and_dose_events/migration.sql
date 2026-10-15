-- CreateEnum
CREATE TYPE "DoseStatus" AS ENUM ('taken', 'skipped');

-- AlterTable: the schedule shape is now final. No endpoint wrote schedules before this
-- migration, so making the source medication required is safe.
ALTER TABLE "MedicationSchedule" ADD COLUMN "strength" TEXT NOT NULL DEFAULT '',
ADD COLUMN "route" TEXT,
ADD COLUMN "duration" TEXT,
ADD COLUMN "instructions" TEXT;
ALTER TABLE "MedicationSchedule" ALTER COLUMN "strength" DROP DEFAULT;
ALTER TABLE "MedicationSchedule" ALTER COLUMN "sourceMedicationId" SET NOT NULL;

-- CreateTable
CREATE TABLE "DoseEvent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "scheduleId" UUID NOT NULL,
    "scheduledFor" TIMESTAMPTZ(3) NOT NULL,
    "status" "DoseStatus" NOT NULL,
    "recordedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DoseEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DoseEvent_scheduleId_scheduledFor_key" ON "DoseEvent"("scheduleId", "scheduledFor");

-- AddForeignKey
ALTER TABLE "DoseEvent" ADD CONSTRAINT "DoseEvent_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "MedicationSchedule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-authored integrity rules (Prisma does not manage CHECK constraints or triggers).

-- A schedule cannot end before it starts.
ALTER TABLE "MedicationSchedule" ADD CONSTRAINT "MedicationSchedule_dates_chk"
  CHECK ("endDate" IS NULL OR "endDate" >= "startDate");

-- Reminder times are HH:MM (24 hour), at most 12, and reminders cannot be on with no times.
ALTER TABLE "MedicationSchedule" ADD CONSTRAINT "MedicationSchedule_reminderTimes_chk"
  CHECK (
    cardinality("reminderTimes") <= 12
    AND ("reminderTimes" = '{}' OR array_to_string("reminderTimes", ',') ~ '^(([01][0-9]|2[0-3]):[0-5][0-9])(,([01][0-9]|2[0-3]):[0-5][0-9])*$')
  );
ALTER TABLE "MedicationSchedule" ADD CONSTRAINT "MedicationSchedule_reminders_chk"
  CHECK ("remindersEnabled" = false OR cardinality("reminderTimes") > 0);

-- The self-reported dose log can never be edited or deleted.
CREATE TRIGGER "DoseEvent_append_only" BEFORE UPDATE OR DELETE ON "DoseEvent"
  FOR EACH ROW EXECUTE FUNCTION "forbid_modification"();
