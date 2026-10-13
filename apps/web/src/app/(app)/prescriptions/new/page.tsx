import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { UploadForm } from "@/components/prescriptions/upload-form";

export const metadata: Metadata = { title: "Upload prescription" };

export default function UploadPrescriptionPage() {
  return (
    <div className="space-y-6">
      <Link href="/prescriptions" className="text-info inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline">
        <ArrowLeft aria-hidden="true" className="size-4" /> All prescriptions
      </Link>
      <PageHeader title="Upload a prescription" description="Add a photo or PDF of a paper prescription. You’ll check what was read from it on the next screen." />
      <UploadForm />
    </div>
  );
}
