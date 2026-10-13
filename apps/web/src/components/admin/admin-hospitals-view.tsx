"use client";

import * as React from "react";
import Link from "next/link";
import { Hospital as HospitalIcon, Plus, Search } from "lucide-react";

import { EmptyState, ErrorState, LoadingState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { SelectField } from "@/components/forms/select-field";
import { DemoTag } from "@/components/status/demo-tag";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { hospitalsApi } from "@/lib/api/hospitals";
import type { Hospital } from "@/lib/api/types";
import { useResource } from "@/lib/use-resource";

/** "" means every status (the select's first option). */
type StatusFilter = "" | "active" | "deactivated";

function StatusBadge({ active }: { active: boolean }) {
  return active ? <Badge tone="success">Active</Badge> : <Badge>Deactivated</Badge>;
}

function matches(h: Hospital, q: string, status: StatusFilter) {
  if (status === "active" && !h.active) return false;
  if (status === "deactivated" && h.active) return false;
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return [h.name, h.city ?? "", ...h.specialties].some((v) => v.toLowerCase().includes(needle));
}

export function AdminHospitalsView() {
  const hospitals = useResource(() => hospitalsApi.listAll(), "admin-hospitals");
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState<StatusFilter>("");
  const searchId = React.useId();

  const addButton = (
    <Button asChild>
      <Link href="/admin/hospitals/new">
        <Plus aria-hidden="true" /> Add hospital
      </Link>
    </Button>
  );

  const list = hospitals.status === "ready" ? hospitals.data : [];
  const shown = list.filter((h) => matches(h, query, status));
  const active = list.filter((h) => h.active).length;

  return (
    <div className="space-y-8">
      <PageHeader title="Hospitals" description="Manage the hospital directory patients book from. Administrators can’t see patient records or who booked a time." actions={addButton} />

      {hospitals.status === "loading" ? (
        <LoadingState label="Loading hospitals" rows={4} />
      ) : hospitals.status === "error" ? (
        <ErrorState error={hospitals.error} onRetry={hospitals.reload} />
      ) : list.length === 0 ? (
        <EmptyState icon={HospitalIcon} title="No hospitals yet" description="Add the first hospital to make it available for patients to book." action={addButton} />
      ) : (
        <>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="w-full max-w-sm space-y-2">
              <Label htmlFor={searchId}>Search hospitals</Label>
              <div className="relative">
                <Search aria-hidden="true" className="text-muted-foreground pointer-events-none absolute top-3 left-3 size-4" />
                <Input id={searchId} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, city or speciality" className="pl-9" />
              </div>
            </div>
            <SelectField
              name="status"
              label="Status"
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusFilter)}
              placeholder="All"
              options={[
                { value: "active", label: "Active" },
                { value: "deactivated", label: "Deactivated" },
              ]}
              className="w-full sm:w-48"
            />
          </div>

          <p role="status" className="text-muted-foreground text-sm">
            {shown.length === list.length ? `${list.length} hospitals: ${active} active, ${list.length - active} deactivated.` : `${shown.length} of ${list.length} hospitals shown.`}
          </p>

          {shown.length === 0 ? (
            <EmptyState
              icon={Search}
              title="No hospitals match"
              description="Try a different search or status."
              action={
                <Button
                  variant="outline"
                  onClick={() => {
                    setQuery("");
                    setStatus("");
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <>
              <div className="hidden md:block">
                <Table>
                  <TableCaption className="sr-only">Hospitals in the directory</TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Hospital</TableHead>
                      <TableHead>City</TableHead>
                      <TableHead>Specialities</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shown.map((h) => (
                      <TableRow key={h.id} className="align-top">
                        <TableCell className="space-y-1">
                          <Link href={`/admin/hospitals/${encodeURIComponent(h.id)}`} className="text-primary font-medium underline-offset-4 hover:underline">
                            {h.name}
                          </Link>
                          {h.isDemo ? (
                            <div>
                              <DemoTag />
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell>{h.city ?? <span className="text-muted-foreground">Not set</span>}</TableCell>
                        <TableCell className="max-w-64">{h.specialties.length ? h.specialties.join(" · ") : <span className="text-muted-foreground">None listed</span>}</TableCell>
                        <TableCell>
                          <StatusBadge active={h.active} />
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <Button asChild variant="outline" size="sm">
                            <Link href={`/admin/hospitals/${encodeURIComponent(h.id)}`} aria-label={`Edit ${h.name}`}>
                              Edit
                            </Link>
                          </Button>{" "}
                          <Button asChild variant="ghost" size="sm">
                            <Link href={`/admin/hospitals/${encodeURIComponent(h.id)}/slots`} aria-label={`Open times for ${h.name}`}>
                              Open times
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <ul className="bg-card divide-y rounded-md border md:hidden">
                {shown.map((h) => (
                  <li key={h.id} className="space-y-3 px-4 py-4">
                    <div className="space-y-1">
                      <p className="flex flex-wrap items-center gap-2">
                        <Link href={`/admin/hospitals/${encodeURIComponent(h.id)}`} className="text-primary font-semibold underline-offset-4 hover:underline">
                          {h.name}
                        </Link>
                        <StatusBadge active={h.active} />
                        {h.isDemo ? <DemoTag /> : null}
                      </p>
                      <p className="text-muted-foreground text-sm">{h.city ?? "City not set"}</p>
                      {h.specialties.length ? <p className="text-sm">{h.specialties.join(" · ")}</p> : null}
                    </div>
                    <div className="flex gap-2">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/admin/hospitals/${encodeURIComponent(h.id)}`} aria-label={`Edit ${h.name}`}>
                          Edit
                        </Link>
                      </Button>
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/admin/hospitals/${encodeURIComponent(h.id)}/slots`} aria-label={`Open times for ${h.name}`}>
                          Open times
                        </Link>
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}
