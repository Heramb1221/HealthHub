"use client";

import * as React from "react";
import Link from "next/link";
import { Hospital as HospitalIcon, Search } from "lucide-react";

import { EmptyState, ErrorState, LoadingState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { DemoTag } from "@/components/status/demo-tag";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { hospitalsApi } from "@/lib/api/hospitals";
import type { Hospital } from "@/lib/api/types";
import { useResource } from "@/lib/use-resource";

function matches(h: Hospital, q: string) {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return [h.name, h.city ?? "", h.address ?? "", ...h.specialties].some((v) => v.toLowerCase().includes(needle));
}

export function HospitalsView() {
  const hospitals = useResource(() => hospitalsApi.list(), "hospitals");
  const [query, setQuery] = React.useState("");
  const searchId = React.useId();

  const shown = hospitals.status === "ready" ? hospitals.data.filter((h) => matches(h, query)) : [];

  return (
    <div className="space-y-8">
      <PageHeader title="Hospitals" description="Hospitals you can book with. Sample hospitals in this environment are labelled as demo data." />

      {hospitals.status === "loading" ? (
        <LoadingState label="Loading hospitals" rows={4} />
      ) : hospitals.status === "error" ? (
        <ErrorState error={hospitals.error} onRetry={hospitals.reload} />
      ) : hospitals.data.length === 0 ? (
        <EmptyState icon={HospitalIcon} title="No hospitals are listed yet" description="Hospitals are added by HealthHub administrators. Check back later." />
      ) : (
        <>
          <div className="max-w-md space-y-2">
            <Label htmlFor={searchId}>Search hospitals</Label>
            <div className="relative">
              <Search aria-hidden="true" className="text-muted-foreground pointer-events-none absolute top-3 left-3 size-4" />
              <Input id={searchId} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, city or speciality" className="pl-9" />
            </div>
          </div>

          <p role="status" className="text-muted-foreground text-sm">
            {query.trim() ? `${shown.length} of ${hospitals.data.length} hospitals match “${query.trim()}”.` : `${hospitals.data.length} ${hospitals.data.length === 1 ? "hospital" : "hospitals"}.`}
          </p>

          {shown.length === 0 ? (
            <EmptyState
              icon={Search}
              title="No hospitals match your search"
              description="Try a different name, city or speciality."
              action={
                <Button variant="outline" onClick={() => setQuery("")}>
                  Clear search
                </Button>
              }
            />
          ) : (
            <ul className="bg-card divide-y rounded-md border">
              {shown.map((h) => (
                <li key={h.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <Link href={`/hospitals/${encodeURIComponent(h.id)}`} className="text-primary text-lg font-semibold underline-offset-4 hover:underline">
                        {h.name}
                      </Link>
                      {h.isDemo ? <DemoTag /> : null}
                    </p>
                    <p className="text-muted-foreground text-sm">{[h.city, h.address].filter(Boolean).join(" · ") || "Address not provided"}</p>
                    <div className="text-muted-foreground flex flex-wrap items-center gap-3 text-xs">
                      {h.timings ? <span>🕒 {h.timings}</span> : null}
                      {h.phone ? <span>📞 {h.phone}</span> : null}
                    </div>
                    {h.specialties.length > 0 ? <p className="text-sm">{h.specialties.join(" · ")}</p> : null}
                  </div>
                  <Button asChild variant="outline" size="sm" className="self-start sm:self-center">
                    <Link href={`/hospitals/${encodeURIComponent(h.id)}`} aria-label={`See available times at ${h.name}`}>
                      See available times
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
