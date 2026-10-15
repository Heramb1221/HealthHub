import type { Metadata } from "next";

import { DemoAccounts } from "@/components/auth/demo-accounts";
import { SignInForm } from "@/components/auth/auth-forms";
import { ProviderButtons } from "@/components/auth/provider-buttons";
import { Separator } from "@/components/ui/separator";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl">Sign in</h1>
        <p className="text-muted-foreground">Use your email and password to open your health record.</p>
      </div>
      <SignInForm next={next} />
      <Separator />
      <ProviderButtons next={next} />
      <DemoAccounts />
    </div>
  );
}
