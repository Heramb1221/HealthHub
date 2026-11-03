import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validatePolicy, type PolicyFormValues } from "../src/lib/validation/insurance";

const ok: PolicyFormValues = {
  providerName: "Star Health",
  policyNumber: "110022334455",
  policyHolderName: "",
  sumInsured: "",
  validFrom: "",
  validTill: "",
  tpaContact: "",
  notes: "",
};

describe("insurance policy validation mirrors the API", () => {
  it("accepts a minimal valid policy", () => assert.deepEqual(validatePolicy(ok), {}));
  it("requires provider and policy number with the API's minimum lengths", () => {
    assert.ok(validatePolicy({ ...ok, providerName: " " }).providerName);
    assert.ok(validatePolicy({ ...ok, providerName: "A" }).providerName);
    assert.ok(validatePolicy({ ...ok, policyNumber: "12" }).policyNumber);
    assert.ok(validatePolicy({ ...ok, policyNumber: "1".repeat(51) }).policyNumber);
  });
  it("checks optional field limits", () => {
    assert.ok(validatePolicy({ ...ok, policyHolderName: "A" }).policyHolderName);
    assert.ok(validatePolicy({ ...ok, sumInsured: "9".repeat(51) }).sumInsured);
    assert.ok(validatePolicy({ ...ok, notes: "n".repeat(501) }).notes);
  });
  it("validates dates and their order", () => {
    assert.ok(validatePolicy({ ...ok, validFrom: "2026-02-30" }).validFrom);
    assert.equal(validatePolicy({ ...ok, validFrom: "2026-01-01", validTill: "2026-01-01" }).validTill, undefined);
    assert.match(validatePolicy({ ...ok, validFrom: "2026-06-01", validTill: "2026-05-31" }).validTill ?? "", /before the start/);
  });
});
