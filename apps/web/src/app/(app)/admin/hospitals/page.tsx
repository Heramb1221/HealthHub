import type { Metadata } from "next";

import { AdminHospitalsView } from "@/components/admin/admin-hospitals-view";

export const metadata: Metadata = { title: "Hospitals · Admin" };

export default function AdminHospitalsPage() {
  return <AdminHospitalsView />;
}
