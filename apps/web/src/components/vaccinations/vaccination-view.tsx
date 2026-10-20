"use client";

import * as React from "react";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Info,
  LoaderCircle,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Syringe,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { EmptyState, ErrorState, LoadingState } from "@/components/feedback/states";
import { isNoPatientError, NoPatientProfile } from "@/components/feedback/no-patient";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { describeError } from "@/lib/api/errors";
import { vaccinationsApi } from "@/lib/api/vaccinations";
import type { PatientVaccination, VaccineCategory } from "@/lib/api/types";
import { useResource } from "@/lib/use-resource";

const CATEGORY_TABS: { key: "all" | VaccineCategory; label: string }[] = [
  { key: "all", label: "All Vaccines" },
  { key: "uip", label: "UIP (Routine)" },
  { key: "iap_private", label: "IAP & Private" },
  { key: "covid19", label: "COVID-19" },
  { key: "special_travel", label: "Travel & Special" },
  { key: "custom", label: "Custom" },
];

type StatusFilter = "all" | "taken" | "not_taken" | "unrecorded";

function VaccineRow({
  item,
  onStatusChange,
  onClear,
}: {
  item: PatientVaccination;
  onStatusChange: (status: "taken" | "not_taken", date?: string | null, notes?: string | null) => Promise<void>;
  onClear: () => Promise<void>;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const [date, setDate] = React.useState(item.administeredDate ?? "");
  const [notes, setNotes] = React.useState(item.notes ?? "");
  const [pending, setPending] = React.useState(false);

  async function handleToggle(targetStatus: "taken" | "not_taken") {
    setPending(true);
    try {
      await onStatusChange(targetStatus, date.trim() || null, notes.trim() || null);
    } finally {
      setPending(false);
    }
  }

  async function handleSaveDetails(e: React.FormEvent) {
    e.preventDefault();
    if (!item.status) {
      toast.error("Please mark the vaccine as Taken or Not Taken first.");
      return;
    }
    setPending(true);
    try {
      await onStatusChange(item.status, date.trim() || null, notes.trim() || null);
      setExpanded(false);
    } finally {
      setPending(false);
    }
  }

  async function handleClear() {
    setPending(true);
    try {
      await onClear();
      setDate("");
      setNotes("");
      setExpanded(false);
    } finally {
      setPending(false);
    }
  }

  const isTaken = item.status === "taken";
  const isNotTaken = item.status === "not_taken";
  const isUnrecorded = item.status === null;

  return (
    <li
      className={`rounded-lg border p-4 transition-colors ${
        isTaken
          ? "border-emerald-200 bg-emerald-50/30 dark:border-emerald-900/40 dark:bg-emerald-950/10"
          : isNotTaken
          ? "border-amber-200 bg-amber-50/20 dark:border-amber-900/40 dark:bg-amber-950/10"
          : "border-border bg-card"
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-foreground">{item.vaccineName}</h3>
            {item.isCustom ? (
              <Badge tone="neutral" className="text-xs">
                Custom entry
              </Badge>
            ) : (
              <span className="text-muted-foreground text-xs">{item.categoryLabel}</span>
            )}
          </div>
          <p className="text-muted-foreground text-sm">{item.description}</p>

          <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
            {isTaken ? (
              <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="size-3.5" aria-hidden="true" />
                Taken{item.administeredDate ? ` on ${item.administeredDate}` : ""}
              </span>
            ) : isNotTaken ? (
              <span className="inline-flex items-center gap-1 font-medium text-amber-700 dark:text-amber-400">
                <XCircle className="size-3.5" aria-hidden="true" />
                Not Taken
              </span>
            ) : (
              <span className="text-muted-foreground inline-flex items-center gap-1">
                <Info className="size-3.5" aria-hidden="true" />
                Status unrecorded
              </span>
            )}

            {item.notes ? <span className="text-muted-foreground truncate italic">“{item.notes}”</span> : null}

            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="text-primary hover:underline inline-flex items-center gap-1 font-medium"
              aria-expanded={expanded}
            >
              {expanded ? (
                <>
                  <ChevronUp className="size-3" aria-hidden="true" /> Less details
                </>
              ) : (
                <>
                  <ChevronDown className="size-3" aria-hidden="true" />{" "}
                  {item.administeredDate || item.notes ? "Edit date/notes" : "+ Add date/notes"}
                </>
              )}
            </button>

            {!isUnrecorded ? (
              <button
                type="button"
                onClick={handleClear}
                disabled={pending}
                className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 underline underline-offset-2"
                title="Reset to unrecorded"
              >
                <RotateCcw className="size-3" aria-hidden="true" /> Clear
              </button>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 pt-1 sm:pt-0" role="group" aria-label={`Status for ${item.vaccineName}`}>
          <Button
            type="button"
            size="sm"
            variant={isTaken ? "default" : "outline"}
            className={`min-w-24 ${
              isTaken
                ? "bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-emerald-700 dark:hover:bg-emerald-600"
                : "hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950/40"
            }`}
            disabled={pending}
            onClick={() => handleToggle("taken")}
            aria-pressed={isTaken}
          >
            {pending && isTaken ? (
              <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            ) : (
              <Check className="size-4" aria-hidden="true" />
            )}
            Taken
          </Button>

          <Button
            type="button"
            size="sm"
            variant={isNotTaken ? "destructive" : "outline"}
            className={`min-w-24 ${
              isNotTaken
                ? "bg-amber-700 hover:bg-amber-800 text-white dark:bg-amber-800"
                : "hover:bg-amber-50 hover:text-amber-800 dark:hover:bg-amber-950/40"
            }`}
            disabled={pending}
            onClick={() => handleToggle("not_taken")}
            aria-pressed={isNotTaken}
          >
            {pending && isNotTaken ? (
              <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            ) : (
              <X className="size-4" aria-hidden="true" />
            )}
            Not Taken
          </Button>
        </div>
      </div>

      {expanded ? (
        <form onSubmit={handleSaveDetails} className="mt-4 border-t pt-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={`date-${item.vaccineName}`} className="block text-xs font-medium text-foreground mb-1">
                Administration date (optional)
              </label>
              <input
                id={`date-${item.vaccineName}`}
                type="date"
                value={date}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div>
              <label htmlFor={`notes-${item.vaccineName}`} className="block text-xs font-medium text-foreground mb-1">
                Notes (e.g. dose number, clinic name)
              </label>
              <input
                id={`notes-${item.vaccineName}`}
                type="text"
                placeholder="e.g. Dose 1 at City Health Center"
                value={notes}
                maxLength={500}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              Save details
            </Button>
          </div>
        </form>
      ) : null}
    </li>
  );
}

function AddCustomVaccineDialog({
  onCancel,
  onSave,
}: {
  onCancel: () => void;
  onSave: (input: { vaccineName: string; status: "taken" | "not_taken"; administeredDate?: string | null; notes?: string | null }) => Promise<void>;
}) {
  const [name, setName] = React.useState("");
  const [status, setStatus] = React.useState<"taken" | "not_taken">("taken");
  const [date, setDate] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Please enter the vaccine name.");
      return;
    }
    setError(null);
    setPending(true);
    try {
      await onSave({
        vaccineName: name.trim(),
        status,
        administeredDate: date.trim() || null,
        notes: notes.trim() || null,
      });
      toast.success("Vaccine record added");
    } catch (err) {
      const { title, detail } = describeError(err);
      setError(`${title}. ${detail}`);
      setPending(false);
    }
  }

  return (
    <div className="bg-card rounded-lg border p-5 space-y-4 max-w-xl">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Add other vaccine</h2>
        <p className="text-muted-foreground text-sm">
          If you have taken a vaccine that is not in the directory, you can record it here.
        </p>
      </div>

      {error ? (
        <Alert tone="danger">
          <AlertTitle>Could not save</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="custom-vaccine-name" className="block text-sm font-medium mb-1">
            Vaccine name *
          </label>
          <input
            id="custom-vaccine-name"
            type="text"
            required
            maxLength={120}
            placeholder="e.g. Tetanus Toxoid, Monkeypox"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <div>
          <span className="block text-sm font-medium mb-2">Have you taken this vaccine? *</span>
          <div className="flex gap-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="custom-status"
                value="taken"
                checked={status === "taken"}
                onChange={() => setStatus("taken")}
                className="accent-primary"
              />
              Yes, I have taken it
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="custom-status"
                value="not_taken"
                checked={status === "not_taken"}
                onChange={() => setStatus("not_taken")}
                className="accent-primary"
              />
              No, I have not taken it
            </label>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="custom-vaccine-date" className="block text-sm font-medium mb-1">
              Date taken (optional)
            </label>
            <input
              id="custom-vaccine-date"
              type="date"
              max={new Date().toISOString().slice(0, 10)}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div>
            <label htmlFor="custom-vaccine-notes" className="block text-sm font-medium mb-1">
              Notes (optional)
            </label>
            <input
              id="custom-vaccine-notes"
              type="text"
              placeholder="e.g. Booster dose"
              maxLength={500}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>

        <div className="flex gap-2 justify-end pt-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending || !name.trim()}>
            {pending ? <LoaderCircle className="animate-spin motion-reduce:animate-none size-4" /> : null}
            Save vaccine
          </Button>
        </div>
      </form>
    </div>
  );
}

export function VaccinationView() {
  const resource = useResource(() => vaccinationsApi.list(), "vaccinations");
  const [selectedCategory, setSelectedCategory] = React.useState<"all" | VaccineCategory>("all");
  const [selectedStatus, setSelectedStatus] = React.useState<StatusFilter>("all");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [addingCustom, setAddingCustom] = React.useState(false);

  async function handleStatusChange(
    targetItem: PatientVaccination,
    status: "taken" | "not_taken",
    administeredDate?: string | null,
    notes?: string | null,
  ) {
    try {
      const updated = await vaccinationsApi.record({
        vaccineName: targetItem.vaccineName,
        vaccineId: targetItem.vaccineId,
        category: targetItem.category,
        status,
        administeredDate,
        notes,
      });

      if (resource.status === "ready" && updated) {
        const nextList = resource.data.data.map((item) =>
          item.vaccineName.toLowerCase() === updated.vaccineName.toLowerCase() ? updated : item,
        );

        if (!nextList.some((item) => item.vaccineName.toLowerCase() === updated.vaccineName.toLowerCase())) {
          nextList.push(updated);
        }

        const nextSummary = {
          total: nextList.length,
          taken: nextList.filter((i) => i.status === "taken").length,
          notTaken: nextList.filter((i) => i.status === "not_taken").length,
          unrecorded: nextList.filter((i) => i.status === null).length,
        };

        resource.setData({ data: nextList, summary: nextSummary });
        toast.success(
          status === "taken"
            ? `Marked "${updated.vaccineName}" as Taken`
            : `Marked "${updated.vaccineName}" as Not Taken`,
        );
      }
    } catch (err) {
      const { title, detail } = describeError(err);
      const msg = detail && detail !== title ? detail : title;
      toast.error(title, { description: msg });
    }
  }

  async function handleClear(targetItem: PatientVaccination) {
    try {
      await vaccinationsApi.remove(targetItem.vaccineName);
      if (resource.status === "ready") {
        const nextList = resource.data.data.map((item) =>
          item.vaccineName.toLowerCase() === targetItem.vaccineName.toLowerCase()
            ? { ...item, status: null, administeredDate: null, notes: null, recordId: null }
            : item,
        );
        const filteredList = targetItem.isCustom
          ? nextList.filter((i) => i.vaccineName.toLowerCase() !== targetItem.vaccineName.toLowerCase())
          : nextList;

        const nextSummary = {
          total: filteredList.length,
          taken: filteredList.filter((i) => i.status === "taken").length,
          notTaken: filteredList.filter((i) => i.status === "not_taken").length,
          unrecorded: filteredList.filter((i) => i.status === null).length,
        };

        resource.setData({ data: filteredList, summary: nextSummary });
        toast.info(`Cleared status for "${targetItem.vaccineName}"`);
      }
    } catch (err) {
      const { title, detail } = describeError(err);
      toast.error(title, { description: detail });
    }
  }

  const addCustomButton = (
    <Button onClick={() => setAddingCustom(true)} variant="outline" size="sm">
      <Plus className="size-4" aria-hidden="true" /> Add other vaccine
    </Button>
  );

  if (resource.status === "loading") {
    return (
      <div className="space-y-6">
        <PageHeader title="Vaccinations" />
        <LoadingState label="Loading your vaccination directory" rows={6} />
      </div>
    );
  }

  if (resource.status === "error") {
    if (isNoPatientError(resource.error)) {
      return (
        <div className="space-y-6">
          <PageHeader title="Vaccinations" />
          <NoPatientProfile />
        </div>
      );
    }
    return (
      <div className="space-y-6">
        <PageHeader title="Vaccinations" />
        <ErrorState error={resource.error} onRetry={resource.reload} />
      </div>
    );
  }

  const items = resource.data.data;
  const summary = resource.data.summary;

  const filtered = items.filter((item) => {

    if (selectedCategory !== "all") {
      if (selectedCategory === "custom" && !item.isCustom && item.category !== "custom") return false;
      if (selectedCategory !== "custom" && item.category !== selectedCategory) return false;
    }

    if (selectedStatus === "taken" && item.status !== "taken") return false;
    if (selectedStatus === "not_taken" && item.status !== "not_taken") return false;
    if (selectedStatus === "unrecorded" && item.status !== null) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchName = item.vaccineName.toLowerCase().includes(q);
      const matchDesc = item.description.toLowerCase().includes(q);
      const matchCat = item.categoryLabel.toLowerCase().includes(q);
      if (!matchName && !matchDesc && !matchCat) return false;
    }

    return true;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vaccinations"
        description="Record and track your immunization history. Includes India's Universal Immunization Programme (UIP), IAP guidelines, COVID-19 vaccines, and travel immunizations."
        actions={addCustomButton}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border bg-card p-4 space-y-1">
          <p className="text-muted-foreground text-xs font-medium">Total Tracked</p>
          <p className="text-2xl font-bold">{summary.total}</p>
          <p className="text-muted-foreground text-xs">Directory & custom</p>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4 space-y-1 dark:border-emerald-950 dark:bg-emerald-950/20">
          <p className="text-emerald-800 text-xs font-medium dark:text-emerald-300">Taken</p>
          <p className="text-2xl font-bold text-emerald-900 dark:text-emerald-200">{summary.taken}</p>
          <p className="text-emerald-700/80 text-xs dark:text-emerald-400">Vaccines received</p>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 space-y-1 dark:border-amber-950 dark:bg-amber-950/20">
          <p className="text-amber-800 text-xs font-medium dark:text-amber-300">Not Taken</p>
          <p className="text-2xl font-bold text-amber-900 dark:text-amber-200">{summary.notTaken}</p>
          <p className="text-amber-700/80 text-xs dark:text-amber-400">Marked unreceived</p>
        </div>
        <div className="rounded-lg border bg-card p-4 space-y-1">
          <p className="text-muted-foreground text-xs font-medium">Unrecorded</p>
          <p className="text-2xl font-bold text-muted-foreground">{summary.unrecorded}</p>
          <p className="text-muted-foreground text-xs">Awaiting input</p>
        </div>
      </div>

      <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground flex items-center gap-2">
        <ShieldCheck className="size-4 shrink-0 text-primary" aria-hidden="true" />
        <span>
          Vaccination entries are self-reported by you for personal health tracking. They do not constitute an official
          government certificate or clinician verification.
        </span>
      </div>

      {addingCustom ? (
        <AddCustomVaccineDialog
          onCancel={() => setAddingCustom(false)}
          onSave={async (input) => {
            const added = await vaccinationsApi.record({
              vaccineName: input.vaccineName,
              category: "custom",
              status: input.status,
              administeredDate: input.administeredDate,
              notes: input.notes,
            });
            const nextList = [added, ...resource.data.data.filter((i) => i.vaccineName.toLowerCase() !== added.vaccineName.toLowerCase())];
            const nextSummary = {
              total: nextList.length,
              taken: nextList.filter((i) => i.status === "taken").length,
              notTaken: nextList.filter((i) => i.status === "not_taken").length,
              unrecorded: nextList.filter((i) => i.status === null).length,
            };
            resource.setData({ data: nextList, summary: nextSummary });
            setAddingCustom(false);
          }}
        />
      ) : null}

      <div className="space-y-3">

        <div role="tablist" aria-label="Vaccine category" className="flex flex-wrap gap-1.5 border-b pb-2">
          {CATEGORY_TABS.map((tab) => (
            <Button
              key={tab.key}
              variant={selectedCategory === tab.key ? "default" : "ghost"}
              size="sm"
              onClick={() => setSelectedCategory(tab.key)}
              role="tab"
              aria-selected={selectedCategory === tab.key}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
            <Button
              variant={selectedStatus === "all" ? "secondary" : "outline"}
              size="sm"
              onClick={() => setSelectedStatus("all")}
            >
              All ({summary.total})
            </Button>
            <Button
              variant={selectedStatus === "taken" ? "secondary" : "outline"}
              size="sm"
              onClick={() => setSelectedStatus("taken")}
            >
              Taken ({summary.taken})
            </Button>
            <Button
              variant={selectedStatus === "not_taken" ? "secondary" : "outline"}
              size="sm"
              onClick={() => setSelectedStatus("not_taken")}
            >
              Not Taken ({summary.notTaken})
            </Button>
            <Button
              variant={selectedStatus === "unrecorded" ? "secondary" : "outline"}
              size="sm"
              onClick={() => setSelectedStatus("unrecorded")}
            >
              Unrecorded ({summary.unrecorded})
            </Button>
          </div>

          <div className="relative max-w-xs w-full">
            <Search className="text-muted-foreground absolute left-2.5 top-2.5 size-4" aria-hidden="true" />
            <input
              type="text"
              placeholder="Search vaccines..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-md border border-input bg-background pl-8 pr-3 py-1.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="size-4" />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Syringe}
          title="No vaccines match your filter"
          description={
            searchQuery
              ? `No vaccines match "${searchQuery}". Try a different keyword or reset filters.`
              : "No vaccines found in this category or status."
          }
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedCategory("all");
                setSelectedStatus("all");
                setSearchQuery("");
              }}
            >
              Reset filters
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs font-medium">
            Showing {filtered.length} of {items.length} vaccines
          </p>
          <ul className="space-y-2.5">
            {filtered.map((item) => (
              <VaccineRow
                key={`${item.vaccineName}-${item.status ?? "none"}-${item.administeredDate ?? ""}-${item.notes ?? ""}`}
                item={item}
                onStatusChange={(status, date, notes) => handleStatusChange(item, status, date, notes)}
                onClear={() => handleClear(item)}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
