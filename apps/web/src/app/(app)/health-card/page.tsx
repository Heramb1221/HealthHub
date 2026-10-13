import type { Metadata } from "next";

import { HealthCardView } from "@/components/health-card/health-card-view";

export const metadata: Metadata = { title: "Digital health card" };

export default function HealthCardPage() {
  return <HealthCardView />;
}
