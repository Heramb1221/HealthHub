import type { Metadata } from "next";
import { SignUp } from "@clerk/nextjs";
import { safeNextPath } from "@/lib/safe-redirect";

export const metadata: Metadata = { title: "Create account" };

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNextPath((await searchParams).next); // same-site paths only
  return (
    <div className="flex flex-col items-center justify-center">
      <h1 className="sr-only">Create your Sehat Meds account</h1>
      <SignUp
        fallbackRedirectUrl={next || "/profile?onboarding=true"}
        signInUrl="/sign-in"
      />
    </div>
  );
}
