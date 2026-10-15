-- CreateTable
CREATE TABLE "QrAccessSession" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "patientId" UUID NOT NULL,
    "prescriptionId" UUID NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QrAccessSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QrAccessSession_patientId_createdAt_idx" ON "QrAccessSession"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "QrAccessSession_prescriptionId_idx" ON "QrAccessSession"("prescriptionId");

-- AddForeignKey
ALTER TABLE "QrAccessSession" ADD CONSTRAINT "QrAccessSession_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QrAccessSession" ADD CONSTRAINT "QrAccessSession_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "PrescriptionRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QrAccessSession" ADD CONSTRAINT "QrAccessSession_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-authored integrity rule (Prisma does not manage CHECK constraints):
-- a session must expire after it is created.
ALTER TABLE "QrAccessSession" ADD CONSTRAINT "QrAccessSession_expiresAt_chk" CHECK ("expiresAt" > "createdAt");
