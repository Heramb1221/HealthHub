import type { Metadata } from "next";

import { AddScheduleView } from "@/components/medications/add-schedule-view";

export const metadata: Metadata = { title: "Add to schedule" };

export default function AddSchedulePage() {
  return <AddScheduleView />;
}
