import type { Metadata } from "next";

import { HospitalDetail } from "@/components/hospitals/hospital-detail";

export const metadata: Metadata = { title: "Hospital" };

export default async function HospitalPage({ params }: { params: Promise<{ hospitalId: string }> }) {
  const { hospitalId } = await params;
  return <HospitalDetail id={hospitalId} />;
}
