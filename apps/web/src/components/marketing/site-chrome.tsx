import Link from "next/link";

import { Brand } from "@/components/layout/brand";
import { LanguageSelector } from "@/components/layout/language-selector";
import { Button } from "@/components/ui/button";

export function SiteHeader() {
  return (
    <header className="glass sticky top-0 z-40 border-x-0 border-t-0">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-3 py-3 sm:gap-4 sm:px-4">
        <div className="min-w-0 shrink">
          <Brand />
        </div>
        <nav aria-label="Account" className="flex shrink-0 items-center gap-1 sm:gap-2">
          <LanguageSelector />
          <Button asChild variant="ghost" size="sm" className="px-1.5 sm:px-3">
            <Link href="/sign-in">Sign in</Link>
          </Button>
          <Button asChild size="sm" className="px-2 sm:px-3">
            <Link href="/sign-up">
              <span className="sm:hidden">Join</span>
              <span className="hidden sm:inline">Create account</span>
            </Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t bg-white/60">
      <div className="text-muted-foreground mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p>Sehat Meds is a personal health-record tool. It does not give medical advice.</p>
        <p>
          <Link href="/sign-in" className="underline underline-offset-4">
            Sign in
          </Link>
          {" · "}
          <Link href="/sign-up" className="underline underline-offset-4">
            Create account
          </Link>
        </p>
      </div>
    </footer>
  );
}
