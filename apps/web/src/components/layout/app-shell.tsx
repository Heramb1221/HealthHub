"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  CalendarClock,
  CalendarDays,
  CreditCard,
  FileText,
  History,
  Hospital,
  IdCard,
  LayoutDashboard,
  LogOut,
  Shield,
  Syringe,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Brand } from "@/components/layout/brand";
import { UserButton } from "@clerk/nextjs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { describeError } from "@/lib/api/errors";
import { useSession } from "@/lib/session/session-provider";
import { useLanguage } from "@/lib/i18n/language-context";
import { LanguageSelector } from "@/components/layout/language-selector";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  key: string;
  icon: LucideIcon;
}

const PATIENT_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", key: "dashboard", icon: LayoutDashboard },
  { href: "/symptoms", label: "Symptom Checker", key: "symptoms", icon: Activity },
  { href: "/prescriptions", label: "Prescriptions", key: "prescriptions", icon: FileText },
  { href: "/medications", label: "Medications", key: "medications", icon: CalendarClock },
  { href: "/history", label: "History", key: "history", icon: History },
  { href: "/vaccinations", label: "Vaccinations", key: "vaccinations", icon: Syringe },
  { href: "/family", label: "Family Tree", key: "family", icon: Users },
  { href: "/insurance", label: "Insurance", key: "insurance", icon: Shield },
  { href: "/health-card", label: "Health card", key: "healthCard", icon: IdCard },
  { href: "/hospitals", label: "Hospitals", key: "hospitals", icon: Hospital },
  { href: "/appointments", label: "Appointments", key: "appointments", icon: CalendarDays },
  { href: "/payments", label: "Payments", key: "payments", icon: CreditCard },
  { href: "/profile", label: "Profile", key: "profile", icon: UserRound },
];

const ADMIN_NAV: NavItem[] = [{ href: "/admin/hospitals", label: "Hospitals", key: "hospitals", icon: Hospital }];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, signOut } = useSession();
  const { t } = useLanguage();
  const isAdmin = user.role === "admin";
  const navItems = isAdmin ? ADMIN_NAV : PATIENT_NAV;

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
            <LanguageSelector />
            <p className="text-muted-foreground hidden items-center gap-2 text-sm sm:flex">
              {user.displayName ?? user.email}
              {isAdmin ? <Badge tone="info">Administrator</Badge> : null}
            </p>
            <UserButton />
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              <LogOut aria-hidden="true" /> {t("sign_out", "Sign out")}
            </Button>
          </div>
        </div>
        <nav aria-label="Main" className="mx-auto max-w-6xl overflow-x-auto px-4">
          <ul className="flex gap-1">
            {navItems.map(({ href, label, key, icon: Icon }) => {
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
                    {t(key, label)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>

      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 print:p-0 print:m-0 print:max-w-none">
        {children}
      </main>
    </div>
  );
}
