import type { Metadata } from "next";

import { AppointmentsView } from "@/components/appointments/appointments-view";

export const metadata: Metadata = { title: "Appointments" };

export default async function AppointmentsPage({ searchParams }: { searchParams: Promise<{ booked?: string }> }) {
  const { booked } = await searchParams;
  return <AppointmentsView justBookedId={booked} />;
}
