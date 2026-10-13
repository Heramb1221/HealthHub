import type { Metadata } from "next";

import { PrescriptionsList } from "@/components/prescriptions/prescriptions-list";

export const metadata: Metadata = { title: "Prescriptions" };

export default function PrescriptionsPage() {
  return <PrescriptionsList />;
}
