import type { Metadata } from "next";

import { EditScheduleView } from "@/components/medications/edit-schedule-view";

export const metadata: Metadata = { title: "Edit reminders" };

export default async function EditSchedulePage({ params }: { params: Promise<{ scheduleId: string }> }) {
  const { scheduleId } = await params;
  return <EditScheduleView id={scheduleId} />;
}
