import type { Metadata } from "next";

import { PaymentsView } from "@/components/payments/payments-view";

export const metadata: Metadata = {
  title: "Payments & Invoices",
  description: "View and pay consultation fees and download digital receipts",
};

export default function PaymentsPage() {
  return <PaymentsView />;
}
