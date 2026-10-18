import type { Metadata } from "next";
import { SignIn } from "@clerk/nextjs";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className="flex flex-col items-center justify-center">
      <SignIn
        fallbackRedirectUrl={next || "/dashboard"}
        signUpUrl="/sign-up"
      />
    </div>
  );
}
