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
import { PageTransition } from "@/components/motion/reveal";
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
    document.querySelector<HTMLElement>('nav[aria-label="Main (compact)"] [aria-current="page"]')?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [pathname]);

  async function handleSignOut() {
    try {
      await signOut();
    } catch (error) {
      const { title, detail } = describeError(error);
      toast.error(title, { description: detail });
    }
  }

  const renderLinks = (orientation: "side" | "pills") =>
    navItems.map(({ href, label, key, icon: Icon }) => {
      const active = pathname === href || pathname.startsWith(`${href}/`);
      return (
        <li key={href} className={orientation === "pills" ? "shrink-0" : undefined}>
          <Link
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 text-sm font-medium whitespace-nowrap transition-colors",
              orientation === "side" ? "rounded-lg px-3 py-2" : "rounded-full border px-3.5 py-2",
              active
                ? "bg-primary text-primary-foreground shadow-[0_6px_14px_rgb(10_107_96/0.25)] border-transparent"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground bg-card/70 border-border/70",
              orientation === "side" && !active ? "border-transparent bg-transparent" : "",
            )}
          >
            <Icon aria-hidden="true" className="size-4" />
            {t(key, label)}
          </Link>
        </li>
      );
    });

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="glass sticky top-0 z-40 border-x-0 border-t-0 print:hidden">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-x-6 gap-y-2 px-4 py-2.5">
          <Brand href={isAdmin ? "/admin/hospitals" : "/dashboard"} />
          <div className="flex items-center gap-2 sm:gap-3">
            <LanguageSelector />
            <p className="text-muted-foreground hidden items-center gap-2 text-sm md:flex">
              {user.displayName ?? user.email}
              {isAdmin ? <Badge tone="info">Administrator</Badge> : null}
            </p>
            <UserButton />
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              <LogOut aria-hidden="true" /> <span className="hidden sm:inline">{t("sign_out", "Sign out")}</span>
              <span className="sr-only sm:hidden">{t("sign_out", "Sign out")}</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-8 px-4 print:block print:max-w-none print:p-0">
        <aside className="hidden w-56 shrink-0 lg:block print:hidden">
          <nav aria-label="Main" className="sticky top-24 py-8">
            <ul className="space-y-1">{renderLinks("side")}</ul>
          </nav>
        </aside>

        <div className="min-w-0 flex-1">
          <nav aria-label="Main (compact)" className="-mx-4 overflow-x-auto px-4 pt-4 lg:hidden print:hidden">
            <ul className="flex gap-2 pb-1">{renderLinks("pills")}</ul>
          </nav>
          <main id="main" className="w-full py-6 lg:py-8 print:p-0 print:m-0 print:max-w-none">
            <PageTransition routeKey={pathname}>{children}</PageTransition>
          </main>
        </div>
      </div>
    </div>
  );
}
