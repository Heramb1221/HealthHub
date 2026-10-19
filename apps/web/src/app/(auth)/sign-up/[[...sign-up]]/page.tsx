import type { Metadata } from "next";
import { SignUp } from "@clerk/nextjs";

export const metadata: Metadata = { title: "Create account" };

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className="flex flex-col items-center justify-center">
      <SignUp
        fallbackRedirectUrl={next || "/profile?onboarding=true"}
        signInUrl="/sign-in"
      />
    </div>
  );
}
