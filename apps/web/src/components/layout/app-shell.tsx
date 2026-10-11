"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarClock, FileText, History, IdCard, LayoutDashboard, LogOut, UserRound, type LucideIcon } from "lucide-react";
import { toast } from "sonner";

import { Brand } from "@/components/layout/brand";
import { Button } from "@/components/ui/button";
import { describeError } from "@/lib/api/errors";
import { useSession } from "@/lib/session/session-provider";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** Only routes that exist are listed. Each build slice adds its own entries. */
const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/prescriptions", label: "Prescriptions", icon: FileText },
  { href: "/medications", label: "Medications", icon: CalendarClock },
  { href: "/history", label: "History", icon: History },
  { href: "/health-card", label: "Health card", icon: IdCard },
  { href: "/profile", label: "Profile", icon: UserRound },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, signOut } = useSession();

  // On narrow screens the tab bar scrolls sideways; keep the current tab visible.
  React.useEffect(() => {
    document.querySelector<HTMLElement>('nav[aria-label="Main"] [aria-current="page"]')?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [pathname]);

  async function handleSignOut() {
    try {
      await signOut();
    } catch (error) {
      const { title, detail } = describeError(error);
      toast.error(title, { description: detail });
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="bg-card border-b print:hidden">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
          <Brand href="/dashboard" />
          <div className="flex items-center gap-3">
            <p className="text-muted-foreground hidden text-sm sm:block">{user.displayName ?? user.email}</p>
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              <LogOut aria-hidden="true" /> Sign out
            </Button>
          </div>
        </div>
        <nav aria-label="Main" className="mx-auto max-w-6xl overflow-x-auto px-4">
          <ul className="flex gap-1">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap",
                      active ? "border-primary text-primary" : "text-muted-foreground hover:text-foreground border-transparent",
                    )}
                  >
                    <Icon aria-hidden="true" className="size-4" />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        {children}
      </main>
    </div>
  );
}
