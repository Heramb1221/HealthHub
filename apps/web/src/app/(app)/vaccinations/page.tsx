import type { Metadata } from "next";

import { VaccinationView } from "@/components/vaccinations/vaccination-view";

export const metadata: Metadata = { title: "Vaccinations" };

export default function VaccinationsPage() {
  return <VaccinationView />;
}
