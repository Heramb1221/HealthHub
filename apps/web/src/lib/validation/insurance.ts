/** Client-side mirror of the API's createPolicySchema (apps/api/src/modules/insurance/routes.ts). */

export interface PolicyFormValues {
  providerName: string;
  policyNumber: string;
  policyHolderName: string;
  sumInsured: string;
  validFrom: string;
  validTill: string;
  tpaContact: string;
  notes: string;
}

export type PolicyField = keyof PolicyFormValues;
export type PolicyErrors = Partial<Record<PolicyField, string>>;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function validDate(value: string): boolean {
  if (!DATE_ONLY.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function validatePolicy(values: PolicyFormValues): PolicyErrors {
  const e: PolicyErrors = {};
  const provider = values.providerName.trim();
  const number = values.policyNumber.trim();
  const holder = values.policyHolderName.trim();

  if (!provider) e.providerName = "Enter the insurance provider.";
  else if (provider.length < 2) e.providerName = "Provider name must be at least 2 characters.";
  else if (provider.length > 100) e.providerName = "Provider name must be 100 characters or fewer.";

  if (!number) e.policyNumber = "Enter the policy number.";
  else if (number.length < 3) e.policyNumber = "Policy number must be at least 3 characters.";
  else if (number.length > 50) e.policyNumber = "Policy number must be 50 characters or fewer.";

  if (holder && holder.length < 2) e.policyHolderName = "Name must be at least 2 characters.";
  else if (holder.length > 100) e.policyHolderName = "Name must be 100 characters or fewer.";

  if (values.sumInsured.trim().length > 50) e.sumInsured = "Keep this to 50 characters or fewer.";
  if (values.tpaContact.trim().length > 50) e.tpaContact = "Keep this to 50 characters or fewer.";
  if (values.notes.trim().length > 500) e.notes = "Notes must be 500 characters or fewer.";

  const from = values.validFrom.trim();
  const till = values.validTill.trim();
  if (from && !validDate(from)) e.validFrom = "Enter a valid start date.";
  if (till && !validDate(till)) e.validTill = "Enter a valid expiry date.";
  if (!e.validFrom && !e.validTill && from && till && till < from) {
    e.validTill = "The expiry date can't be before the start date.";
  }
  return e;
}
