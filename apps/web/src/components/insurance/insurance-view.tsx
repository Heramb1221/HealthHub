"use client";

import * as React from "react";
import {
  Building2,
  ExternalLink,
  FileCheck2,
  Info,
  LoaderCircle,
  Phone,
  Plus,
  Search,
  Shield,
  Trash2,
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
import { Label } from "@/components/ui/label";
import { describeError } from "@/lib/api/errors";
import { insuranceApi } from "@/lib/api/insurance";
import type { InsuranceProviderInfo, PatientInsurancePolicy } from "@/lib/api/types";
import { useResource } from "@/lib/use-resource";

export function InsuranceView() {
  const [activeTab, setActiveTab] = React.useState<"policies" | "providers">("policies");
  const [showAddForm, setShowAddForm] = React.useState(false);
  const [searchProviderQuery, setSearchProviderQuery] = React.useState("");

  const policiesResource = useResource(() => insuranceApi.listPolicies(), "patient-policies");

  const providersResource = useResource(() => insuranceApi.listProviders(), "insurance-providers");

  const [providerName, setProviderName] = React.useState("");
  const [policyNumber, setPolicyNumber] = React.useState("");
  const [policyHolderName, setPolicyHolderName] = React.useState("");
  const [sumInsured, setSumInsured] = React.useState("");
  const [validFrom, setValidFrom] = React.useState("");
  const [validTill, setValidTill] = React.useState("");
  const [tpaContact, setTpaContact] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  async function handleAddPolicy(e: React.FormEvent) {
    e.preventDefault();
    if (!providerName.trim() || !policyNumber.trim()) {
      toast.error("Provider Name and Policy Number are required.");
      return;
    }

    setSaving(true);
    try {
      await insuranceApi.createPolicy({
        providerName: providerName.trim(),
        policyNumber: policyNumber.trim(),
        policyHolderName: policyHolderName.trim() || undefined,
        sumInsured: sumInsured.trim() || undefined,
        validFrom: validFrom.trim() || undefined,
        validTill: validTill.trim() || undefined,
        tpaContact: tpaContact.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      toast.success("Insurance policy saved securely.");
      setShowAddForm(false);

      setProviderName("");
      setPolicyNumber("");
      setPolicyHolderName("");
      setSumInsured("");
      setValidFrom("");
      setValidTill("");
      setTpaContact("");
      setNotes("");
      await policiesResource.reload();
    } catch (err) {
      const { title, detail } = describeError(err);
      toast.error(title, { description: detail });
    } finally {
      setSaving(false);
    }
  }

  async function handleDeletePolicy(id: string, name: string) {
    if (!window.confirm(`Are you sure you want to remove the policy from "${name}"?`)) return;
    setDeletingId(id);
    try {
      await insuranceApi.deletePolicy(id);
      toast.success("Policy removed.");
      await policiesResource.reload();
    } catch (err) {
      const { title, detail } = describeError(err);
      toast.error(title, { description: detail });
    } finally {
      setDeletingId(null);
    }
  }

  if (policiesResource.status === "error" && isNoPatientError(policiesResource.error)) {
    return <NoPatientProfile />;
  }

  const policies: PatientInsurancePolicy[] = policiesResource.status === "ready" ? policiesResource.data : [];
  const providers: InsuranceProviderInfo[] = providersResource.status === "ready" ? providersResource.data : [];

  const filteredProviders = providers.filter((p: InsuranceProviderInfo) => {
    const q = searchProviderQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      p.code.toLowerCase().includes(q) ||
      p.popularPlans.some((plan: string) => plan.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader
          title="Health Insurance & Policy Vault"
          description="Maintain your health coverage records and access cashless claim emergency assistance contacts."
        />
        {activeTab === "policies" && !showAddForm && (
          <Button onClick={() => setShowAddForm(true)} className="self-start sm:self-center">
            <Plus className="size-4" /> Add Insurance Policy
          </Button>
        )}
      </div>

      <div className="border-border flex gap-2 border-b pb-1">
        <button
          type="button"
          onClick={() => setActiveTab("policies")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "policies"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Shield className="size-4" /> My Policies ({policies.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("providers")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "providers"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Building2 className="size-4" /> Recognized Insurers ({providers.length})
        </button>
      </div>

      {activeTab === "policies" && (
        <div className="space-y-6">

          <Alert tone="neutral">
            <Info className="size-4" />
            <AlertTitle>Informational Record Notice</AlertTitle>
            <AlertDescription className="text-xs">
              Policy information stored in HealthHub is patient-managed for personal medical record access and emergency claim convenience.
              It does not constitute an authoritative guarantee of coverage or active policy verification from the insurance provider.
            </AlertDescription>
          </Alert>

          {showAddForm && (
            <form onSubmit={handleAddPolicy} className="bg-card border-border space-y-4 rounded-lg border p-6 shadow-xs">
              <div className="flex items-center justify-between border-b pb-3">
                <h2 className="text-base font-semibold">Add New Insurance Policy</h2>
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowAddForm(false)}>
                  <X className="size-4" />
                </Button>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="providerName" className="text-xs font-semibold">
                    Insurance Provider *
                  </Label>
                  <Input
                    id="providerName"
                    list="provider-suggestions"
                    placeholder="e.g. Star Health or HDFC ERGO"
                    value={providerName}
                    onChange={(e) => setProviderName(e.target.value)}
                    required
                  />
                  <datalist id="provider-suggestions">
                    {providers.map((p) => (
                      <option key={p.id} value={p.name} />
                    ))}
                  </datalist>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="policyNumber" className="text-xs font-semibold">
                    Policy Number *
                  </Label>
                  <Input
                    id="policyNumber"
                    placeholder="e.g. 110022334455"
                    value={policyNumber}
                    onChange={(e) => setPolicyNumber(e.target.value)}
                    required
                  />
                  <span className="text-muted-foreground text-[11px]">Will be masked for privacy in dashboard views.</span>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="policyHolder" className="text-xs font-semibold">
                    Policy Holder Name
                  </Label>
                  <Input
                    id="policyHolder"
                    placeholder="Primary insured person's full name"
                    value={policyHolderName}
                    onChange={(e) => setPolicyHolderName(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="sumInsured" className="text-xs font-semibold">
                    Sum Insured (Cover Amount)
                  </Label>
                  <Input
                    id="sumInsured"
                    placeholder="e.g. ₹5,00,000 or ₹10 Lakhs"
                    value={sumInsured}
                    onChange={(e) => setSumInsured(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="validFrom" className="text-xs font-semibold">
                    Policy Start Date
                  </Label>
                  <Input
                    id="validFrom"
                    type="date"
                    value={validFrom}
                    onChange={(e) => setValidFrom(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="validTill" className="text-xs font-semibold">
                    Policy Renewal / Expiry Date
                  </Label>
                  <Input
                    id="validTill"
                    type="date"
                    value={validTill}
                    onChange={(e) => setValidTill(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="tpaContact" className="text-xs font-semibold">
                    TPA / Cashless Claim Contact
                  </Label>
                  <Input
                    id="tpaContact"
                    placeholder="e.g. 1800 425 2255"
                    value={tpaContact}
                    onChange={(e) => setTpaContact(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="notes" className="text-xs font-semibold">
                    Notes / Co-pay Details
                  </Label>
                  <Input
                    id="notes"
                    placeholder="e.g. 10% co-pay on day-care, includes room rent cap"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowAddForm(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? <LoaderCircle className="size-4 animate-spin" /> : <FileCheck2 className="size-4" />}
                  Save Policy
                </Button>
              </div>
            </form>
          )}

          {policiesResource.status === "loading" ? (
            <LoadingState label="Loading insurance policies" />
          ) : policiesResource.status === "error" ? (
            <ErrorState error={policiesResource.error} onRetry={policiesResource.reload} />
          ) : policies.length === 0 ? (
            <EmptyState
              icon={Shield}
              title="No insurance policies saved"
              description="Keep your health insurance coverage, sum insured, and cashless emergency TPA desk contacts handy for hospital admissions."
              action={
                <Button onClick={() => setShowAddForm(true)}>
                  <Plus className="size-4" /> Add Your First Policy
                </Button>
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {policies.map((p) => {
                const isExpired = p.validTill ? new Date(p.validTill) < new Date() : false;
                return (
                  <div key={p.id} className="bg-card border-border flex flex-col justify-between rounded-lg border p-5 shadow-xs">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <Badge tone="info" className="mb-1 text-xs">
                            Health Policy
                          </Badge>
                          <h3 className="text-base font-semibold text-foreground">{p.providerName}</h3>
                        </div>
                        <Badge tone={isExpired ? "danger" : "success"}>
                          {isExpired ? "Expired" : "Active"}
                        </Badge>
                      </div>

                      <div className="space-y-1.5 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Policy Number:</span>
                          <span className="font-mono font-medium">{p.maskedPolicyNumber}</span>
                        </div>
                        {p.policyHolderName && (
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Insured Person:</span>
                            <span className="font-medium">{p.policyHolderName}</span>
                          </div>
                        )}
                        {p.sumInsured && (
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Sum Insured:</span>
                            <span className="font-medium text-emerald-600 dark:text-emerald-400">{p.sumInsured}</span>
                          </div>
                        )}
                        {p.validTill && (
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Renewal Due:</span>
                            <span className="font-medium">{p.validTill}</span>
                          </div>
                        )}
                        {p.tpaContact && (
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">TPA / Cashless:</span>
                            <a
                              href={`tel:${p.tpaContact.replace(/\s+/g, "")}`}
                              className="text-primary hover:underline flex items-center gap-1 font-medium"
                            >
                              <Phone className="size-3" /> {p.tpaContact}
                            </a>
                          </div>
                        )}
                        {p.notes && (
                          <div className="bg-muted/40 mt-2 rounded-md p-2 text-[11px] text-muted-foreground">
                            {p.notes}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="border-border mt-4 flex items-center justify-between border-t pt-3">
                      <span className="text-muted-foreground text-[11px]">
                        Saved: {new Date(p.createdAt).toLocaleDateString()}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10"
                        onClick={() => handleDeletePolicy(p.id, p.providerName)}
                        disabled={deletingId === p.id}
                      >
                        {deletingId === p.id ? (
                          <LoaderCircle className="size-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="size-3.5" />
                        )}
                        Delete
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === "providers" && (
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <Search className="text-muted-foreground size-4" />
            <Input
              placeholder="Search Indian health insurance providers or plans (e.g. Star, Optima, Care)..."
              value={searchProviderQuery}
              onChange={(e) => setSearchProviderQuery(e.target.value)}
              className="max-w-md"
            />
          </div>

          {providersResource.status === "loading" ? (
            <LoadingState label="Loading insurance providers" />
          ) : providersResource.status === "error" ? (
            <ErrorState error={providersResource.error} onRetry={providersResource.reload} />
          ) : filteredProviders.length === 0 ? (
            <EmptyState
              icon={Search}
              title="No providers found"
              description={`No recognized insurer matches "${searchProviderQuery}".`}
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {filteredProviders.map((prov) => (
                <div key={prov.id} className="bg-card border-border flex flex-col justify-between rounded-lg border p-5 shadow-xs">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <Badge tone="neutral" className="mb-1 text-[11px] uppercase">
                          {prov.type.replace(/_/g, " ")}
                        </Badge>
                        <h3 className="text-base font-semibold">{prov.name}</h3>
                      </div>
                      <Badge tone="info" className="text-xs">
                        {prov.code}
                      </Badge>
                    </div>

                    <div className="space-y-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Cashless Claim Helpline:</span>
                        <a
                          href={`tel:${prov.cashlessHelpline.replace(/\s+/g, "")}`}
                          className="text-primary font-medium flex items-center gap-1 hover:underline"
                        >
                          <Phone className="size-3" /> {prov.cashlessHelpline}
                        </a>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Customer Support:</span>
                        <span className="font-medium">{prov.customerSupportPhone}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">TPA Desk Email:</span>
                        <span className="font-medium text-muted-foreground">{prov.tpaDeskEmail}</span>
                      </div>
                    </div>

                    {prov.popularPlans && prov.popularPlans.length > 0 && (
                      <div className="border-border border-t pt-2">
                        <span className="text-muted-foreground text-[11px] font-medium">Popular Recognized Plans:</span>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {prov.popularPlans.map((pl) => (
                            <span key={pl} className="bg-muted text-foreground rounded-sm px-1.5 py-0.5 text-[11px]">
                              {pl}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="border-border mt-4 flex items-center justify-between border-t pt-3">
                    <span className="text-muted-foreground text-[11px]">Verified: {prov.lastVerified}</span>
                    <a
                      href={prov.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline flex items-center gap-1 text-xs font-medium"
                    >
                      Visit Website <ExternalLink className="size-3" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
