import type { Metadata } from "next";

import { NewHospital } from "@/components/admin/new-hospital";

export const metadata: Metadata = { title: "Add hospital · Admin" };

export default function NewHospitalPage() {
  return <NewHospital />;
}
