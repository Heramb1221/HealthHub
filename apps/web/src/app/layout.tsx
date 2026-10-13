import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "./globals.css";

import { DemoBanner } from "@/components/layout/demo-banner";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: { default: "HealthHub", template: "%s · HealthHub" },
  description: "Keep your prescriptions, medication schedule and medical history in one place.",
};

export const viewport: Viewport = {
  themeColor: "#12355b",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body className="min-h-dvh">
        <a
          href="#main"
          className="bg-primary text-primary-foreground sr-only z-50 rounded-md px-4 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        >
          Skip to main content
        </a>
        <DemoBanner />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
