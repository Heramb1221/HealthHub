-- AlterTable
ALTER TABLE "Patient" ADD COLUMN "preferredLanguage" TEXT DEFAULT 'en';
ALTER TABLE "Patient" ADD COLUMN "timeZone" TEXT DEFAULT 'Asia/Kolkata';
ALTER TABLE "Patient" ADD COLUMN "termsAcceptedVersion" TEXT;

-- CreateTable
CREATE TABLE "HospitalReview" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "hospitalId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "reviewText" TEXT,
    "isVerifiedPatient" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HospitalReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HospitalReview_hospitalId_createdAt_idx" ON "HospitalReview"("hospitalId", "createdAt");

-- CreateIndex
CREATE INDEX "HospitalReview_patientId_idx" ON "HospitalReview"("patientId");

-- AddForeignKey
ALTER TABLE "HospitalReview" ADD CONSTRAINT "HospitalReview_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalReview" ADD CONSTRAINT "HospitalReview_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
