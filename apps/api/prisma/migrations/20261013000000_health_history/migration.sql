-- CreateEnum
CREATE TYPE "HistoryKind" AS ENUM ('condition');

-- CreateEnum
CREATE TYPE "HistorySource" AS ENUM ('patient_reported');

-- CreateTable
CREATE TABLE "HealthHistoryEntry" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "patientId" UUID NOT NULL,
    "kind" "HistoryKind" NOT NULL DEFAULT 'condition',
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "diagnosedOn" DATE,
    "source" "HistorySource" NOT NULL DEFAULT 'patient_reported',
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'unverified',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthHistoryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HealthHistoryEntry_patientId_createdAt_idx" ON "HealthHistoryEntry"("patientId", "createdAt");

-- AddForeignKey
ALTER TABLE "HealthHistoryEntry" ADD CONSTRAINT "HealthHistoryEntry_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-authored integrity rules (Prisma does not manage triggers).
-- The history log can never be edited or deleted.
CREATE TRIGGER "HealthHistoryEntry_append_only" BEFORE UPDATE OR DELETE ON "HealthHistoryEntry"
  FOR EACH ROW EXECUTE FUNCTION "forbid_modification"();
