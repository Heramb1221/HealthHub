-- CreateEnum
CREATE TYPE "VaccinationStatus" AS ENUM ('taken', 'not_taken');

-- CreateTable
CREATE TABLE "PatientVaccination" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "patientId" UUID NOT NULL,
    "vaccineId" TEXT,
    "vaccineName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" "VaccinationStatus" NOT NULL,
    "administeredDate" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientVaccination_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PatientVaccination_patientId_vaccineName_key" ON "PatientVaccination"("patientId", "vaccineName");

-- CreateIndex
CREATE INDEX "PatientVaccination_patientId_createdAt_idx" ON "PatientVaccination"("patientId", "createdAt");

-- AddForeignKey
ALTER TABLE "PatientVaccination" ADD CONSTRAINT "PatientVaccination_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
