import type { Metadata } from "next";

import { MedicationsView } from "@/components/medications/medications-view";

export const metadata: Metadata = { title: "Medication schedule" };

export default function MedicationsPage() {
  return <MedicationsView />;
}
