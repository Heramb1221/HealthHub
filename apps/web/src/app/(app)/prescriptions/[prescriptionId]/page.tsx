import type { Metadata } from "next";

import { PrescriptionDetail } from "@/components/prescriptions/prescription-detail";

export const metadata: Metadata = { title: "Prescription" };

export default async function PrescriptionPage({ params }: { params: Promise<{ prescriptionId: string }> }) {
  const { prescriptionId } = await params;
  return <PrescriptionDetail id={prescriptionId} />;
}
