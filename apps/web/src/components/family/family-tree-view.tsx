"use client";

import * as React from "react";
import {
  Activity,
  Heart,
  LayoutList,
  LoaderCircle,
  Network,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  User,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { EmptyState, ErrorState, LoadingState } from "@/components/feedback/states";
import { isNoPatientError, NoPatientProfile } from "@/components/feedback/no-patient";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { describeError } from "@/lib/api/errors";
import { familyApi } from "@/lib/api/family";
import { patientsApi } from "@/lib/api/patients";
import type {
  CreateFamilyMemberInput,
  FamilyMember,
  FamilyRelationship,
  Generation,
  Patient,
  UpdateFamilyMemberInput,
  VitalStatus,
} from "@/lib/api/types";
import { useResource } from "@/lib/use-resource";

const RELATIONSHIPS: { value: FamilyRelationship; label: string; generation: Generation }[] = [
  // Grandparents
  { value: "paternal_grandfather", label: "Paternal Grandfather (Dad's Father)", generation: "grandparents" },
  { value: "paternal_grandmother", label: "Paternal Grandmother (Dad's Mother)", generation: "grandparents" },
  { value: "maternal_grandfather", label: "Maternal Grandfather (Mom's Father)", generation: "grandparents" },
  { value: "maternal_grandmother", label: "Maternal Grandmother (Mom's Mother)", generation: "grandparents" },
  // Parents
  { value: "father", label: "Father", generation: "parents" },
  { value: "mother", label: "Mother", generation: "parents" },
  // Current Generation
  { value: "spouse", label: "Spouse", generation: "current" },
  { value: "brother", label: "Brother", generation: "current" },
  { value: "sister", label: "Sister", generation: "current" },
  // Children
  { value: "son", label: "Son", generation: "children" },
  { value: "daughter", label: "Daughter", generation: "children" },
  // Other
  { value: "other", label: "Other Relative", generation: "other" },
];

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;

const COMMON_CONDITIONS = [
  "Type 2 Diabetes",
  "Hypertension",
  "Coronary Artery Disease",
  "High Cholesterol",
  "Asthma",
  "Hypothyroidism",
  "Stroke",
  "Cancer",
  "Osteoarthritis",
  "Alzheimer's / Dementia",
];

const GENERATION_METADATA: Record<Generation, { title: string; subtitle: string }> = {
  grandparents: {
    title: "Grandparents (1st Generation)",
    subtitle: "Paternal & maternal grandparents and elder lineage",
  },
  parents: {
    title: "Parents (2nd Generation)",
    subtitle: "Father, mother, and immediate parental history",
  },
  current: {
    title: "Current Generation (Patient & Siblings)",
    subtitle: "Spouse, brothers, sisters, and peers",
  },
  children: {
    title: "Children (Next Generation)",
    subtitle: "Sons and daughters",
  },
  other: {
    title: "Extended Relatives",
    subtitle: "Aunts, uncles, cousins, and other family members",
  },
};

interface MemberModalState {
  isOpen: boolean;
  mode: "create" | "edit";
  member?: FamilyMember;
  defaultRelationship?: FamilyRelationship;
}

export function FamilyTreeView() {
  const resource = useResource(() => familyApi.list(), "family-tree");
  const patientResource = useResource(() => patientsApi.getMe(), "current-patient");
  const [viewMode, setViewMode] = React.useState<"tree" | "list">("tree");
  const [modalState, setModalState] = React.useState<MemberModalState>({ isOpen: false, mode: "create" });
  const [deletePendingId, setDeletePendingId] = React.useState<string | null>(null);

  if (resource.status === "error") {
    if (isNoPatientError(resource.error)) {
      return <NoPatientProfile />;
    }
    return <ErrorState error={resource.error} onRetry={resource.reload} />;
  }

  if (resource.status === "loading") {
    return <LoadingState label="Loading family tree..." />;
  }

  const data = resource.data;
  const patient = patientResource.status === "ready" ? patientResource.data : null;
  const totalCount = data.totalMembers;

  async function handleDelete(member: FamilyMember) {
    if (!window.confirm(`Are you sure you want to remove ${member.fullName} (${member.relationshipLabel}) from your family tree?`)) {
      return;
    }
    setDeletePendingId(member.id);
    try {
      await familyApi.remove(member.id);
      toast.success(`${member.fullName} removed from family tree`);
      resource.reload();
    } catch (err) {
      const { title, detail } = describeError(err);
      toast.error(title, { description: detail });
    } finally {
      setDeletePendingId(null);
    }
  }

  function openAddModal(defaultRelationship?: FamilyRelationship) {
    setModalState({ isOpen: true, mode: "create", defaultRelationship });
  }

  function openEditModal(member: FamilyMember) {
    setModalState({ isOpen: true, mode: "edit", member });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader
          title="Family Health Tree"
          description="Record multi-generational family health history to identify hereditary risk patterns. Family members have no account access."
        />
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {/* View mode toggle */}
          <div className="inline-flex rounded-lg border bg-muted p-0.5 text-xs font-medium">
            <button
              type="button"
              onClick={() => setViewMode("tree")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors ${
                viewMode === "tree"
                  ? "bg-background text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              aria-label="View as interactive tree diagram"
            >
              <Network className="size-3.5" aria-hidden="true" />
              <span>Tree Diagram</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors ${
                viewMode === "list"
                  ? "bg-background text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              aria-label="View as list"
            >
              <LayoutList className="size-3.5" aria-hidden="true" />
              <span>List View</span>
            </button>
          </div>

          <Button onClick={() => openAddModal()} className="h-9">
            <Plus aria-hidden="true" /> Add family member
          </Button>
        </div>
      </div>

      <Alert>
        <ShieldCheck className="size-4" aria-hidden="true" />
        <AlertTitle>Clinical safety notice</AlertTitle>
        <AlertDescription>
          Family health history is recorded by you to assist healthcare providers during consultations. It does not constitute a medical diagnosis or genetic testing result, and adding a relative never grants them account or medical record access.
        </AlertDescription>
      </Alert>

      {/* Hereditary Risk Insights Panel */}
      {data.hereditaryRisks.length > 0 && (
        <section aria-labelledby="hereditary-risks-title" className="bg-card rounded-lg border p-4 shadow-xs">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="size-4 text-primary" aria-hidden="true" />
            <h2 id="hereditary-risks-title" className="text-base font-semibold">
              Identified Hereditary Health Patterns
            </h2>
            <Badge tone="info">{data.hereditaryRisks.length} recurring conditions</Badge>
          </div>
          <p className="text-muted-foreground text-xs mb-3">
            Conditions present across multiple blood relatives may indicate a familial predisposition. Discuss these observations with your physician.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.hereditaryRisks.map((risk) => (
              <div key={risk.condition} className="bg-muted/40 rounded-md border p-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-sm text-foreground">{risk.condition}</span>
                    <Badge tone={risk.count > 1 ? "warning" : "neutral"} className="shrink-0 text-xs">
                      {risk.count} {risk.count === 1 ? "relative" : "relatives"}
                    </Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {risk.members.map((m, idx) => (
                      <span
                        key={`${m.name}-${idx}`}
                        className="inline-flex items-center text-xs bg-background/90 text-muted-foreground border rounded px-1.5 py-0.5"
                      >
                        {m.relationLabel}: {m.name}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Main Family Tree: Diagram or List View */}
      {totalCount === 0 && !patient ? (
        <EmptyState
          icon={Users}
          title="No family members recorded"
          description="Start building your family tree to track hereditary health risks across generations. Add your parents, grandparents, or siblings."
          action={
            <Button onClick={() => openAddModal()}>
              <Plus aria-hidden="true" /> Add first family member
            </Button>
          }
        />
      ) : viewMode === "tree" ? (
        <FamilyTreeDiagram
          members={data.data ?? Object.values(data.generations).flat()}
          patient={patient}
          onAdd={openAddModal}
          onEdit={openEditModal}
          onDelete={handleDelete}
          deletePendingId={deletePendingId}
        />
      ) : (
        <FamilyListView
          data={data}
          onEdit={openEditModal}
          onDelete={handleDelete}
          deletePendingId={deletePendingId}
        />
      )}

      {/* Member Form Modal */}
      {modalState.isOpen && (
        <FamilyMemberModal
          mode={modalState.mode}
          member={modalState.member}
          defaultRelationship={modalState.defaultRelationship}
          onClose={() => setModalState({ isOpen: false, mode: "create" })}
          onSaved={async () => {
            setModalState({ isOpen: false, mode: "create" });
            resource.reload();
          }}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Visual Family Tree Diagram Component                                       */
/* -------------------------------------------------------------------------- */

interface FamilyTreeDiagramProps {
  members: FamilyMember[];
  patient: Patient | null;
  onAdd: (defaultRelationship?: FamilyRelationship) => void;
  onEdit: (member: FamilyMember) => void;
  onDelete: (member: FamilyMember) => void;
  deletePendingId: string | null;
}

function FamilyTreeDiagram({
  members,
  patient,
  onAdd,
  onEdit,
  onDelete,
  deletePendingId,
}: FamilyTreeDiagramProps) {
  // Categorize family members according to their specific biological/kinship roles
  const patGrandfather = members.find((m) => m.relationship === "paternal_grandfather");
  const patGrandmother = members.find((m) => m.relationship === "paternal_grandmother");

  const matGrandfather = members.find((m) => m.relationship === "maternal_grandfather");
  const matGrandmother = members.find((m) => m.relationship === "maternal_grandmother");

  const father = members.find((m) => m.relationship === "father");
  const mother = members.find((m) => m.relationship === "mother");

  const spouse = members.find((m) => m.relationship === "spouse");
  const siblings = members.filter((m) => m.relationship === "brother" || m.relationship === "sister");
  const children = members.filter((m) => m.relationship === "son" || m.relationship === "daughter");
  const extended = members.filter((m) => m.relationship === "other");

  return (
    <div className="rounded-xl border bg-card/60 p-4 sm:p-6 shadow-xs overflow-x-auto">
      <div className="min-w-[780px] max-w-5xl mx-auto flex flex-col items-center space-y-10 py-4">

        {/* ---------------- LEVEL 1: GRANDPARENTS ---------------- */}
        <section aria-labelledby="generation-grandparents" className="w-full flex flex-col items-center">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted px-2.5 py-0.5 rounded-full border">
              1st Generation · Grandparents
            </span>
          </div>

          <div className="w-full grid grid-cols-2 gap-8 lg:gap-16">
            {/* Paternal Lineage (Dad's side) */}
            <div className="flex flex-col items-center">
              <span className="text-xs font-medium text-muted-foreground mb-3">Paternal Lineage (Father&apos;s Parents)</span>
              <div className="flex items-center gap-3">
                {patGrandfather ? (
                  <TreeMemberCard
                    member={patGrandfather}
                    onEdit={() => onEdit(patGrandfather)}
                    onDelete={() => onDelete(patGrandfather)}
                    isDeletePending={deletePendingId === patGrandfather.id}
                  />
                ) : (
                  <EmptySlotNode label="Paternal Grandfather" onClick={() => onAdd("paternal_grandfather")} />
                )}

                {/* Horizontal marriage/partnership bridge */}
                <div className="flex flex-col items-center">
                  <div className="h-0.5 w-6 bg-border" />
                  <Heart className="size-3 text-muted-foreground/60 my-0.5" aria-hidden="true" />
                  <div className="h-0.5 w-6 bg-border" />
                </div>

                {patGrandmother ? (
                  <TreeMemberCard
                    member={patGrandmother}
                    onEdit={() => onEdit(patGrandmother)}
                    onDelete={() => onDelete(patGrandmother)}
                    isDeletePending={deletePendingId === patGrandmother.id}
                  />
                ) : (
                  <EmptySlotNode label="Paternal Grandmother" onClick={() => onAdd("paternal_grandmother")} />
                )}
              </div>

              {/* Vertical connector down to Father */}
              <div className="w-0.5 h-8 bg-border mt-3" />
            </div>

            {/* Maternal Lineage (Mom's side) */}
            <div className="flex flex-col items-center">
              <span className="text-xs font-medium text-muted-foreground mb-3">Maternal Lineage (Mother&apos;s Parents)</span>
              <div className="flex items-center gap-3">
                {matGrandfather ? (
                  <TreeMemberCard
                    member={matGrandfather}
                    onEdit={() => onEdit(matGrandfather)}
                    onDelete={() => onDelete(matGrandfather)}
                    isDeletePending={deletePendingId === matGrandfather.id}
                  />
                ) : (
                  <EmptySlotNode label="Maternal Grandfather" onClick={() => onAdd("maternal_grandfather")} />
                )}

                {/* Horizontal marriage/partnership bridge */}
                <div className="flex flex-col items-center">
                  <div className="h-0.5 w-6 bg-border" />
                  <Heart className="size-3 text-muted-foreground/60 my-0.5" aria-hidden="true" />
                  <div className="h-0.5 w-6 bg-border" />
                </div>

                {matGrandmother ? (
                  <TreeMemberCard
                    member={matGrandmother}
                    onEdit={() => onEdit(matGrandmother)}
                    onDelete={() => onDelete(matGrandmother)}
                    isDeletePending={deletePendingId === matGrandmother.id}
                  />
                ) : (
                  <EmptySlotNode label="Maternal Grandmother" onClick={() => onAdd("maternal_grandmother")} />
                )}
              </div>

              {/* Vertical connector down to Mother */}
              <div className="w-0.5 h-8 bg-border mt-3" />
            </div>
          </div>
        </section>

        {/* ---------------- LEVEL 2: PARENTS ---------------- */}
        <section aria-labelledby="generation-parents" className="w-full flex flex-col items-center -mt-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted px-2.5 py-0.5 rounded-full border">
              2nd Generation · Parents
            </span>
          </div>

          <div className="flex items-center justify-center gap-6 sm:gap-12 relative">
            {/* Father Node */}
            <div className="flex flex-col items-center">
              {father ? (
                <TreeMemberCard
                  member={father}
                  onEdit={() => onEdit(father)}
                  onDelete={() => onDelete(father)}
                  isDeletePending={deletePendingId === father.id}
                />
              ) : (
                <EmptySlotNode label="Father" onClick={() => onAdd("father")} />
              )}
            </div>

            {/* Marriage bridge between Parents */}
            <div className="flex items-center gap-2 relative">
              <div className="h-0.5 w-8 sm:w-16 bg-primary/40" />
              <div className="flex flex-col items-center px-1.5 py-1 bg-muted rounded-full border text-[10px] text-muted-foreground font-semibold">
                <span>Parents</span>
              </div>
              <div className="h-0.5 w-8 sm:w-16 bg-primary/40" />

              {/* Stem dropping down from the exact center of parents union */}
              <div className="absolute left-1/2 -bottom-10 -translate-x-1/2 w-0.5 h-10 bg-primary/40" />
            </div>

            {/* Mother Node */}
            <div className="flex flex-col items-center">
              {mother ? (
                <TreeMemberCard
                  member={mother}
                  onEdit={() => onEdit(mother)}
                  onDelete={() => onDelete(mother)}
                  isDeletePending={deletePendingId === mother.id}
                />
              ) : (
                <EmptySlotNode label="Mother" onClick={() => onAdd("mother")} />
              )}
            </div>
          </div>
        </section>

        {/* ---------------- LEVEL 3: CURRENT GENERATION (PATIENT, SIBLINGS, SPOUSE) ---------------- */}
        <section aria-labelledby="generation-current" className="w-full flex flex-col items-center pt-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted px-2.5 py-0.5 rounded-full border">
              3rd Generation · Current Generation (You &amp; Peers)
            </span>
          </div>

          {/* Sibling & Patient branching line */}
          <div className="w-full flex flex-col items-center">
            {/* Horizontal distribution bar across offspring */}
            <div className="relative flex flex-wrap items-center justify-center gap-4 sm:gap-6 pt-6">
              {/* Top horizontal distribution rail */}
              <div className="absolute top-0 left-12 right-12 h-0.5 bg-primary/30" />

              {/* Siblings */}
              {siblings.map((sib) => (
                <div key={sib.id} className="flex flex-col items-center relative">
                  <div className="w-0.5 h-6 bg-primary/30 absolute -top-6" />
                  <TreeMemberCard
                    member={sib}
                    onEdit={() => onEdit(sib)}
                    onDelete={() => onDelete(sib)}
                    isDeletePending={deletePendingId === sib.id}
                  />
                </div>
              ))}

              {/* Add Sibling quick action */}
              <div className="flex flex-col items-center relative">
                <div className="w-0.5 h-6 bg-primary/30 absolute -top-6" />
                <button
                  type="button"
                  onClick={() => onAdd("brother")}
                  className="h-28 w-36 rounded-lg border border-dashed border-border hover:border-primary/60 bg-muted/20 hover:bg-muted/40 text-muted-foreground hover:text-foreground text-xs flex flex-col items-center justify-center gap-1.5 transition-colors cursor-pointer p-2"
                >
                  <Plus className="size-4" aria-hidden="true" />
                  <span className="font-medium text-center">Add Sibling</span>
                </button>
              </div>

              {/* YOU (Patient) & SPOUSE group */}
              <div className="flex flex-col items-center relative">
                {/* Vertical stem connecting patient to parental line */}
                <div className="w-0.5 h-6 bg-primary absolute -top-6" />

                <div className="flex items-center gap-4 sm:gap-6 relative">
                  {/* Patient Node */}
                  <PatientTreeNode patient={patient} />

                  {/* Partnership bridge between Patient and Spouse */}
                  <div className="flex items-center gap-1.5 relative">
                    <div className="h-0.5 w-6 sm:w-10 bg-primary/40" />
                    <div className="flex items-center gap-1 px-1.5 py-0.5 bg-muted rounded-full border text-[10px] text-muted-foreground font-semibold">
                      <Heart className="size-2.5 text-primary" aria-hidden="true" />
                      <span>Union</span>
                    </div>
                    <div className="h-0.5 w-6 sm:w-10 bg-primary/40" />

                    {/* Stem dropping down to children */}
                    <div className="absolute left-1/2 -bottom-10 -translate-x-1/2 w-0.5 h-10 bg-primary/40" />
                  </div>

                  {/* Spouse Node */}
                  {spouse ? (
                    <TreeMemberCard
                      member={spouse}
                      onEdit={() => onEdit(spouse)}
                      onDelete={() => onDelete(spouse)}
                      isDeletePending={deletePendingId === spouse.id}
                    />
                  ) : (
                    <EmptySlotNode label="Spouse" onClick={() => onAdd("spouse")} />
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ---------------- LEVEL 4: CHILDREN ---------------- */}
        <section aria-labelledby="generation-children" className="w-full flex flex-col items-center pt-2">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted px-2.5 py-0.5 rounded-full border">
              4th Generation · Next Generation (Children)
            </span>
          </div>

          <div className="w-full flex flex-col items-center">
            <div className="relative flex flex-wrap items-center justify-center gap-4 sm:gap-6 pt-6">
              {children.length > 0 && (
                <div className="absolute top-0 left-12 right-12 h-0.5 bg-primary/30" />
              )}

              {children.map((child) => (
                <div key={child.id} className="flex flex-col items-center relative">
                  <div className="w-0.5 h-6 bg-primary/30 absolute -top-6" />
                  <TreeMemberCard
                    member={child}
                    onEdit={() => onEdit(child)}
                    onDelete={() => onDelete(child)}
                    isDeletePending={deletePendingId === child.id}
                  />
                </div>
              ))}

              <div className="flex flex-col items-center relative">
                {children.length > 0 && <div className="w-0.5 h-6 bg-primary/30 absolute -top-6" />}
                <button
                  type="button"
                  onClick={() => onAdd("son")}
                  className="h-28 w-36 rounded-lg border border-dashed border-border hover:border-primary/60 bg-muted/20 hover:bg-muted/40 text-muted-foreground hover:text-foreground text-xs flex flex-col items-center justify-center gap-1.5 transition-colors cursor-pointer p-2"
                >
                  <Plus className="size-4" aria-hidden="true" />
                  <span className="font-medium text-center">Add Child</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ---------------- LEVEL 5: EXTENDED RELATIVES (IF ANY) ---------------- */}
        {extended.length > 0 && (
          <section aria-labelledby="generation-extended" className="w-full flex flex-col items-center pt-6 border-t">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted px-2.5 py-0.5 rounded-full border">
                Extended Lineage &amp; Other Relatives
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-4">
              {extended.map((member) => (
                <TreeMemberCard
                  key={member.id}
                  member={member}
                  onEdit={() => onEdit(member)}
                  onDelete={() => onDelete(member)}
                  isDeletePending={deletePendingId === member.id}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Tree Member Card Component                                                 */
/* -------------------------------------------------------------------------- */

function TreeMemberCard({
  member,
  onEdit,
  onDelete,
  isDeletePending,
}: {
  member: FamilyMember;
  onEdit: () => void;
  onDelete: () => void;
  isDeletePending: boolean;
}) {
  const isDeceased = member.vitalStatus === "deceased";

  return (
    <div
      className={`w-48 sm:w-52 rounded-lg border bg-card p-3 shadow-xs hover:border-foreground/30 transition-all flex flex-col justify-between text-left ${
        isDeceased ? "opacity-90 bg-muted/20" : ""
      }`}
    >
      <div>
        <div className="flex items-start justify-between gap-1 mb-1">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider truncate max-w-[120px]">
            {member.relationshipLabel}
          </span>
          <Badge
            tone={member.vitalStatus === "alive" ? "success" : member.vitalStatus === "deceased" ? "neutral" : "info"}
            className="text-[10px] px-1.5 py-0 font-normal shrink-0 capitalize"
          >
            {member.vitalStatus}
          </Badge>
        </div>

        <h4 className="font-semibold text-sm text-foreground truncate flex items-center gap-1">
          <User className="size-3 text-muted-foreground shrink-0" aria-hidden="true" />
          <span className="truncate">{member.fullName}</span>
        </h4>

        <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground mt-1">
          {member.age !== null && (
            <span className="bg-muted px-1.5 py-0.2 rounded font-medium text-foreground/80">
              {isDeceased ? `Died at ${member.age}` : `${member.age} yrs`}
            </span>
          )}
          {member.bloodGroup && (
            <span className="bg-muted px-1.5 py-0.2 rounded font-medium text-foreground/80">
              {member.bloodGroup}
            </span>
          )}
        </div>

        {member.conditions.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {member.conditions.slice(0, 3).map((c, i) => (
              <span
                key={i}
                className="text-[10px] bg-amber-500/10 text-amber-900 dark:text-amber-300 border border-amber-500/20 px-1 py-0.2 rounded truncate max-w-[140px]"
                title={c}
              >
                {c}
              </span>
            ))}
            {member.conditions.length > 3 && (
              <span className="text-[10px] text-muted-foreground font-medium">
                +{member.conditions.length - 3} more
              </span>
            )}
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground/70 italic mt-1.5">No conditions listed</p>
        )}
      </div>

      <div className="flex items-center justify-end gap-1 pt-2.5 mt-2 border-t text-xs">
        <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[11px]" onClick={onEdit}>
          <Pencil className="size-2.5 mr-0.5" aria-hidden="true" /> Edit
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-1.5 text-[11px] text-destructive hover:text-destructive"
          disabled={isDeletePending}
          onClick={onDelete}
        >
          {isDeletePending ? (
            <LoaderCircle className="size-2.5 animate-spin mr-0.5" />
          ) : (
            <Trash2 className="size-2.5 mr-0.5" aria-hidden="true" />
          )}
          Delete
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Patient Tree Node (You)                                                    */
/* -------------------------------------------------------------------------- */

function PatientTreeNode({ patient }: { patient: Patient | null }) {
  const conditions = patient?.conditions ?? [];

  return (
    <div className="w-52 sm:w-56 rounded-lg border-2 border-primary bg-primary/5 p-3.5 shadow-sm text-left relative ring-2 ring-primary/20">
      <div className="flex items-start justify-between gap-1 mb-1">
        <span className="text-[11px] font-bold text-primary uppercase tracking-wider flex items-center gap-1">
          <span className="inline-block size-1.5 rounded-full bg-primary animate-pulse" />
          You (Patient)
        </span>
        <Badge tone="success" className="text-[10px] px-1.5 py-0 font-normal shrink-0">
          Self
        </Badge>
      </div>

      <h4 className="font-bold text-sm text-foreground truncate">
        {patient?.fullName ?? "You"}
      </h4>

      <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground mt-1">
        {patient?.bloodGroup && (
          <span className="bg-primary/10 text-primary font-medium px-1.5 py-0.2 rounded border border-primary/20">
            Blood {patient.bloodGroup}
          </span>
        )}
        <span className="text-muted-foreground text-[11px]">Primary record</span>
      </div>

      {conditions.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {conditions.slice(0, 3).map((c, i) => (
            <span
              key={i}
              className="text-[10px] bg-amber-500/10 text-amber-900 dark:text-amber-300 border border-amber-500/20 px-1 py-0.2 rounded truncate max-w-[140px]"
              title={c}
            >
              {c}
            </span>
          ))}
          {conditions.length > 3 && (
            <span className="text-[10px] text-muted-foreground font-medium">
              +{conditions.length - 3} more
            </span>
          )}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground/70 italic mt-1.5">No chronic conditions listed</p>
      )}

      <div className="pt-2 mt-2 border-t text-[10px] text-muted-foreground flex items-center justify-between">
        <span>Linked to profile</span>
        <span className="font-semibold text-primary">Core Profile</span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Empty Slot Node                                                            */
/* -------------------------------------------------------------------------- */

function EmptySlotNode({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-48 sm:w-52 h-32 rounded-lg border border-dashed border-border hover:border-primary/60 bg-muted/15 hover:bg-muted/30 text-muted-foreground hover:text-foreground text-xs flex flex-col items-center justify-center gap-2 transition-colors cursor-pointer p-3 group"
    >
      <div className="size-6 rounded-full bg-muted flex items-center justify-center group-hover:bg-primary/10 group-hover:text-primary transition-colors">
        <Plus className="size-3.5" aria-hidden="true" />
      </div>
      <div className="text-center">
        <span className="font-medium block text-foreground/80 group-hover:text-foreground">
          + Add {label}
        </span>
        <span className="text-[10px] text-muted-foreground block mt-0.5">Not recorded yet</span>
      </div>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* List View Mode Component                                                   */
/* -------------------------------------------------------------------------- */

function FamilyListView({
  data,
  onEdit,
  onDelete,
  deletePendingId,
}: {
  data: {
    totalMembers: number;
    generations: Record<Generation, FamilyMember[]>;
  };
  onEdit: (member: FamilyMember) => void;
  onDelete: (member: FamilyMember) => void;
  deletePendingId: string | null;
}) {
  const generationsOrder: Generation[] = ["grandparents", "parents", "current", "children", "other"];

  return (
    <div className="space-y-8">
      {generationsOrder.map((genKey) => {
        const members = data.generations[genKey] || [];
        if (members.length === 0) return null;
        const meta = GENERATION_METADATA[genKey];

        return (
          <section key={genKey} aria-labelledby={`gen-title-${genKey}`} className="space-y-3">
            <div className="border-b pb-2">
              <div className="flex items-center justify-between">
                <h2 id={`gen-title-${genKey}`} className="text-base font-semibold text-foreground">
                  {meta.title}
                </h2>
                <span className="text-xs text-muted-foreground">
                  {members.length} {members.length === 1 ? "person" : "people"}
                </span>
              </div>
              <p className="text-muted-foreground text-xs">{meta.subtitle}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="bg-card rounded-lg border p-4 shadow-xs flex flex-col justify-between hover:border-foreground/20 transition-colors"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-medium text-foreground text-sm flex items-center gap-1.5">
                          <User className="size-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
                          {member.fullName}
                        </h3>
                        <p className="text-xs text-muted-foreground mt-0.5 font-medium">{member.relationshipLabel}</p>
                      </div>
                      <Badge
                        tone={
                          member.vitalStatus === "alive"
                            ? "success"
                            : member.vitalStatus === "deceased"
                              ? "neutral"
                              : "info"
                        }
                        className="capitalize text-xs shrink-0"
                      >
                        {member.vitalStatus}
                      </Badge>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground pt-1">
                      {member.age !== null && (
                        <span className="bg-muted px-2 py-0.5 rounded font-medium text-foreground/80">
                          {member.vitalStatus === "deceased" ? `Died at ${member.age} yrs` : `${member.age} yrs old`}
                        </span>
                      )}
                      {member.bloodGroup && (
                        <span className="bg-muted px-2 py-0.5 rounded font-medium text-foreground/80">
                          Blood {member.bloodGroup}
                        </span>
                      )}
                    </div>

                    {member.conditions.length > 0 ? (
                      <div className="pt-2">
                        <span className="text-[11px] font-medium text-muted-foreground block mb-1">
                          Recorded Conditions:
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {member.conditions.map((cond, cIdx) => (
                            <Badge key={cIdx} tone="warning" className="text-xs font-normal">
                              {cond}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground/80 italic pt-1">No chronic conditions listed</p>
                    )}

                    {member.notes && (
                      <div className="bg-muted/30 rounded p-2 text-xs text-muted-foreground border mt-2">
                        <span className="font-medium text-foreground/80 block mb-0.5">Notes:</span>
                        {member.notes}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-1.5 pt-4 mt-2 border-t">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => onEdit(member)}
                    >
                      <Pencil className="size-3 mr-1" aria-hidden="true" /> Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                      disabled={deletePendingId === member.id}
                      onClick={() => onDelete(member)}
                    >
                      {deletePendingId === member.id ? (
                        <LoaderCircle className="size-3 animate-spin mr-1" />
                      ) : (
                        <Trash2 className="size-3 mr-1" aria-hidden="true" />
                      )}
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Family Member Modal Component                                              */
/* -------------------------------------------------------------------------- */

function FamilyMemberModal({
  mode,
  member,
  defaultRelationship,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  member?: FamilyMember;
  defaultRelationship?: FamilyRelationship;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [fullName, setFullName] = React.useState(member?.fullName ?? "");
  const [relationship, setRelationship] = React.useState<FamilyRelationship>(
    member?.relationship ?? defaultRelationship ?? "father"
  );
  const [vitalStatus, setVitalStatus] = React.useState<VitalStatus>(member?.vitalStatus ?? "alive");
  const [age, setAge] = React.useState<string>(member?.age !== null && member?.age !== undefined ? String(member.age) : "");
  const [bloodGroup, setBloodGroup] = React.useState<string>(member?.bloodGroup ?? "");
  const [conditions, setConditions] = React.useState<string[]>(member?.conditions ?? []);
  const [newConditionInput, setNewConditionInput] = React.useState("");
  const [notes, setNotes] = React.useState(member?.notes ?? "");
  const [submitting, setSubmitting] = React.useState(false);

  function handleAddCondition(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (!conditions.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
      setConditions([...conditions, trimmed]);
    }
    setNewConditionInput("");
  }

  function handleRemoveCondition(index: number) {
    setConditions(conditions.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) {
      toast.error("Please enter the full name");
      return;
    }

    setSubmitting(true);
    try {
      const parsedAge = age.trim() ? parseInt(age.trim(), 10) : null;
      if (parsedAge !== null && (isNaN(parsedAge) || parsedAge < 0 || parsedAge > 130)) {
        toast.error("Please enter a valid age between 0 and 130");
        setSubmitting(false);
        return;
      }

      if (mode === "create") {
        const input: CreateFamilyMemberInput = {
          fullName: fullName.trim(),
          relationship,
          vitalStatus,
          age: parsedAge,
          bloodGroup: (bloodGroup as typeof BLOOD_GROUPS[number]) || null,
          conditions,
          notes: notes.trim() || null,
        };
        await familyApi.create(input);
        toast.success(`${fullName} added to family tree`);
      } else if (member) {
        const input: UpdateFamilyMemberInput = {
          fullName: fullName.trim(),
          relationship,
          vitalStatus,
          age: parsedAge,
          bloodGroup: (bloodGroup as typeof BLOOD_GROUPS[number]) || null,
          conditions,
          notes: notes.trim() || null,
        };
        await familyApi.update(member.id, input);
        toast.success(`Updated details for ${fullName}`);
      }
      await onSaved();
    } catch (err) {
      const { title, detail } = describeError(err);
      toast.error(title, { description: detail });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
    >
      <div className="bg-card max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b pb-3">
          <h2 id="modal-title" className="text-lg font-semibold text-foreground">
            {mode === "create" ? "Add Family Member" : `Edit ${member?.fullName}`}
          </h2>
          <Button variant="ghost" size="sm" className="size-8 p-0" onClick={onClose}>
            <X className="size-4" aria-hidden="true" />
            <span className="sr-only">Close</span>
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="member-fullname" className="text-xs font-medium text-foreground block mb-1">
              Full Name *
            </label>
            <Input
              id="member-fullname"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Ramesh Sharma"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="member-relationship" className="text-xs font-medium text-foreground block mb-1">
                Relationship *
              </label>
              <select
                id="member-relationship"
                value={relationship}
                onChange={(e) => setRelationship(e.target.value as FamilyRelationship)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {RELATIONSHIPS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="member-vital" className="text-xs font-medium text-foreground block mb-1">
                Vital Status
              </label>
              <select
                id="member-vital"
                value={vitalStatus}
                onChange={(e) => setVitalStatus(e.target.value as VitalStatus)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="alive">Alive</option>
                <option value="deceased">Deceased</option>
                <option value="unknown">Unknown</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="member-age" className="text-xs font-medium text-foreground block mb-1">
                {vitalStatus === "deceased" ? "Age at Death (years)" : "Current Age (years)"}
              </label>
              <Input
                id="member-age"
                type="number"
                min="0"
                max="130"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="e.g. 58"
              />
            </div>

            <div>
              <label htmlFor="member-blood" className="text-xs font-medium text-foreground block mb-1">
                Blood Group
              </label>
              <select
                id="member-blood"
                value={bloodGroup}
                onChange={(e) => setBloodGroup(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Unknown / Unspecified</option>
                {BLOOD_GROUPS.map((bg) => (
                  <option key={bg} value={bg}>
                    {bg}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Known Medical / Hereditary Conditions
            </label>
            <p className="text-muted-foreground text-xs mb-2">
              Add known conditions (e.g. Diabetes, Heart Disease, Hypertension, Asthma).
            </p>

            <div className="flex gap-2 mb-2">
              <Input
                value={newConditionInput}
                onChange={(e) => setNewConditionInput(e.target.value)}
                placeholder="Enter condition name"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddCondition(newConditionInput);
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleAddCondition(newConditionInput)}
                disabled={!newConditionInput.trim()}
              >
                Add
              </Button>
            </div>

            {/* Quick Suggestions */}
            <div className="flex flex-wrap gap-1 mb-2">
              {COMMON_CONDITIONS.filter((c) => !conditions.some((existing) => existing.toLowerCase() === c.toLowerCase())).slice(0, 5).map((quick) => (
                <button
                  type="button"
                  key={quick}
                  onClick={() => handleAddCondition(quick)}
                  className="text-[11px] bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground px-2 py-0.5 rounded border transition-colors cursor-pointer"
                >
                  + {quick}
                </button>
              ))}
            </div>

            {conditions.length > 0 && (
              <div className="flex flex-wrap gap-1.5 p-2 bg-muted/30 rounded border">
                {conditions.map((c, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 bg-background text-xs border rounded-md px-2 py-1 font-medium"
                  >
                    {c}
                    <button
                      type="button"
                      onClick={() => handleRemoveCondition(i)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="size-3" aria-hidden="true" />
                      <span className="sr-only">Remove {c}</span>
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <label htmlFor="member-notes" className="text-xs font-medium text-foreground block mb-1">
              Clinical Notes / History
            </label>
            <Textarea
              id="member-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Age of onset, medications, surgical history, or cause of death"
              rows={3}
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <LoaderCircle className="size-4 animate-spin mr-1" /> : null}
              {mode === "create" ? "Add to Family Tree" : "Save Changes"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
