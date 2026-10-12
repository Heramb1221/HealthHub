"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

import { HospitalForm } from "@/components/admin/hospital-form";
import { PageHeader } from "@/components/layout/page-header";
import { adminHospitalsApi } from "@/lib/api/admin-hospitals";

export function NewHospital() {
  const router = useRouter();
  return (
    <div className="space-y-6">
      <Link href="/admin/hospitals" className="text-info inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline">
        <ArrowLeft aria-hidden="true" className="size-4" /> All hospitals
      </Link>
      <PageHeader title="Add a hospital" description="It becomes visible to patients as soon as it’s saved." />
      <HospitalForm
        submitLabel="Add hospital"
        cancelHref="/admin/hospitals"
        onSubmit={async (input) => {
          const created = await adminHospitalsApi.create(input);
          toast.success("Hospital added");
          router.push(`/admin/hospitals/${encodeURIComponent(created.id)}`);
        }}
      />
    </div>
  );
}
