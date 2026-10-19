import Link from "next/link";

import { Brand } from "@/components/layout/brand";
import { LanguageSelector } from "@/components/layout/language-selector";
import { Button } from "@/components/ui/button";

export function SiteHeader() {
  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
        <Brand />
        <nav aria-label="Account" className="flex items-center gap-2">
          <LanguageSelector />
          <Button asChild variant="ghost" size="sm">
            <Link href="/sign-in">Sign in</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/sign-up">Create account</Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="text-muted-foreground mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p>Sehat Med is a personal health-record tool. It does not give medical advice.</p>
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
