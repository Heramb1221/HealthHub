"use client";

import Link from "next/link";
import { HeartPulse } from "lucide-react";

export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="text-primary inline-flex shrink-0 items-center gap-2.5 font-semibold tracking-tight">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.png"
        alt="Sehat Meds Logo"
        width={32}
        height={32}
        className="size-8 shrink-0 object-contain rounded-md"
        onError={(e) => {
          e.currentTarget.style.display = "none";
          const fallback = e.currentTarget.nextElementSibling as HTMLElement;
          if (fallback) fallback.style.display = "inline-block";
        }}
      />
      <HeartPulse aria-hidden="true" className="text-accent-foreground size-6 hidden" />
      <span className="flex flex-col whitespace-nowrap min-w-0">
        <span className="text-base sm:text-lg font-bold leading-tight tracking-tight">Sehat Meds</span>
        <span className="text-muted-foreground -mt-0.5 hidden text-[10px] font-medium tracking-normal sm:block">
          Bharat ka apna Saathi
        </span>
      </span>
    </Link>
  );
}
