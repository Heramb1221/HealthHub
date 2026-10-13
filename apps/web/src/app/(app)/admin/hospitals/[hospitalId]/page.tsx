import type { Metadata } from "next";

import { AdminHospitalEdit } from "@/components/admin/admin-hospital-edit";

export const metadata: Metadata = { title: "Edit hospital · Admin" };

export default async function EditHospitalPage({ params }: { params: Promise<{ hospitalId: string }> }) {
  const { hospitalId } = await params;
  return <AdminHospitalEdit id={hospitalId} />;
}
