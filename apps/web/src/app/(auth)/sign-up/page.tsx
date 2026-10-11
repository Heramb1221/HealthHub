import type { Metadata } from "next";

import { SignUpForm } from "@/components/auth/auth-forms";
import { ProviderButtons } from "@/components/auth/provider-buttons";
import { Separator } from "@/components/ui/separator";
import { IS_DEMO } from "@/lib/api/config";

export const metadata: Metadata = { title: "Create account" };

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl">Create your account</h1>
        <p className="text-muted-foreground">
          {IS_DEMO
            ? "Demo mode: your account exists only in this browser, and no password is stored."
            : "You’ll get a HealthHub ID after you create your profile."}
        </p>
      </div>
      <SignUpForm next={next} />
      <Separator />
      <ProviderButtons />
    </div>
  );
}
