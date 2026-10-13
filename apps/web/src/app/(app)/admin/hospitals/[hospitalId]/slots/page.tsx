import type { Metadata } from "next";

import { AdminSlotsView } from "@/components/admin/admin-slots-view";

export const metadata: Metadata = { title: "Open times · Admin" };

export default async function AdminSlotsPage({ params }: { params: Promise<{ hospitalId: string }> }) {
  const { hospitalId } = await params;
  return <AdminSlotsView id={hospitalId} />;
}
