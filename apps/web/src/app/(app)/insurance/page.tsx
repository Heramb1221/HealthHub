import type { Metadata } from "next";

import { InsuranceView } from "@/components/insurance/insurance-view";

export const metadata: Metadata = {
  title: "Health Insurance & Policy Vault",
  description: "Manage health insurance policies and cashless claim contacts",
};

export default function InsurancePage() {
  return <InsuranceView />;
}
