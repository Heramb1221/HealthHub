-- CreateEnum
CREATE TYPE "FamilyRelationship" AS ENUM ('father', 'mother', 'spouse', 'brother', 'sister', 'son', 'daughter', 'paternal_grandfather', 'paternal_grandmother', 'maternal_grandfather', 'maternal_grandmother', 'other');

-- CreateEnum
CREATE TYPE "VitalStatus" AS ENUM ('alive', 'deceased', 'unknown');

-- CreateTable
CREATE TABLE "FamilyMember" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "patientId" UUID NOT NULL,
    "fullName" TEXT NOT NULL,
    "relationship" "FamilyRelationship" NOT NULL,
    "vitalStatus" "VitalStatus" NOT NULL DEFAULT 'alive',
    "age" INTEGER,
    "bloodGroup" TEXT,
    "conditions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FamilyMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FamilyMember_patientId_createdAt_idx" ON "FamilyMember"("patientId", "createdAt");

-- AddForeignKey
ALTER TABLE "FamilyMember" ADD CONSTRAINT "FamilyMember_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
