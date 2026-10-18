import { describe, expect, it } from "vitest";
import { maskPolicyNumber } from "../src/modules/insurance/service.js";
import { INDIAN_INSURANCE_PROVIDERS } from "../src/modules/insurance/providers.js";

describe("insurance module", () => {
  it("masks policy numbers to preserve patient privacy", () => {
    expect(maskPolicyNumber("STAR12345678")).toBe("•••• •••• 5678");
    expect(maskPolicyNumber("1234")).toBe("•••• 1234");
    expect(maskPolicyNumber("HDFC-99887766")).toBe("•••• •••• 7766");
  });

  it("provides verified Indian insurance providers with emergency cashless helpline", () => {
    expect(INDIAN_INSURANCE_PROVIDERS.length).toBeGreaterThanOrEqual(5);
    const star = INDIAN_INSURANCE_PROVIDERS.find((p) => p.id === "star-health");
    expect(star).toBeDefined();
    expect(star?.cashlessHelpline).toBeDefined();
    expect(star?.lastVerified).toBeDefined();
  });
});
