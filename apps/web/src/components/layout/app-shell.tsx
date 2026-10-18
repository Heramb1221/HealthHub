"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarClock, CalendarDays, FileText, History, Hospital, IdCard, LayoutDashboard, LogOut, Syringe, UserRound, Users, type LucideIcon } from "lucide-react";
import { toast } from "sonner";

import { Brand } from "@/components/layout/brand";
import { UserButton } from "@clerk/nextjs";
import { Badge } from "@/components/ui/badge";
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
const PATIENT_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/prescriptions", label: "Prescriptions", icon: FileText },
  { href: "/medications", label: "Medications", icon: CalendarClock },
  { href: "/history", label: "History", icon: History },
  { href: "/vaccinations", label: "Vaccinations", icon: Syringe },
  { href: "/family", label: "Family Tree", icon: Users },
  { href: "/health-card", label: "Health card", icon: IdCard },
  { href: "/hospitals", label: "Hospitals", icon: Hospital },
  { href: "/appointments", label: "Appointments", icon: CalendarDays },
  { href: "/profile", label: "Profile", icon: UserRound },
];

/** Administrators manage the hospital directory only. They have no patient records, so no patient screens are listed. */
const ADMIN_NAV: NavItem[] = [{ href: "/admin/hospitals", label: "Hospitals", icon: Hospital }];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, signOut } = useSession();
  const isAdmin = user.role === "admin";
  const navItems = isAdmin ? ADMIN_NAV : PATIENT_NAV;

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
          <Brand href={isAdmin ? "/admin/hospitals" : "/dashboard"} />
          <div className="flex items-center gap-3">
            <p className="text-muted-foreground hidden items-center gap-2 text-sm sm:flex">
              {user.displayName ?? user.email}
              {isAdmin ? <Badge tone="info">Administrator</Badge> : null}
            </p>
            <UserButton />
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              <LogOut aria-hidden="true" /> Sign out
            </Button>
          </div>
        </div>
        <nav aria-label="Main" className="mx-auto max-w-6xl overflow-x-auto px-4">
          <ul className="flex gap-1">
            {navItems.map(({ href, label, icon: Icon }) => {
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
