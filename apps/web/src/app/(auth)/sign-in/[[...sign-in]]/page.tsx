import type { Metadata } from "next";
import { SignIn } from "@clerk/nextjs";
import { safeNextPath } from "@/lib/safe-redirect";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next: requested } = await searchParams;
  const next = safeNextPath(requested); // same-site paths only
  return (
    <div className="flex flex-col items-center justify-center">
      <h1 className="sr-only">Sign in to Sehat Meds</h1>
      <SignIn
        fallbackRedirectUrl={next || "/dashboard"}
        signUpUrl="/sign-up"
      />
    </div>
  );
}
