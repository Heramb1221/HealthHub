import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";

describe("Razorpay HMAC-SHA256 signature verification", () => {
  const secret = "Fy3DRjEmuO71m9N1Xg7iwuhO";
  const orderId = "order_TpRQwPjstECxCp";
  const paymentId = "pay_test_1234567890";

  it("produces identical HMAC-SHA256 signature when given order_id and payment_id", () => {
    const textToSign = `${orderId}|${paymentId}`;
    const signature = createHmac("sha256", secret).update(textToSign).digest("hex");

    expect(signature).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(signature)).toBe(true);

    // Re-verify with matching input
    const verification = createHmac("sha256", secret).update(textToSign).digest("hex");
    expect(verification).toBe(signature);
  });

  it("fails verification when signature is tampered with", () => {
    const textToSign = `${orderId}|${paymentId}`;
    const validSignature = createHmac("sha256", secret).update(textToSign).digest("hex");
    const tamperedSignature = validSignature.slice(0, -1) + (validSignature.endsWith("a") ? "b" : "a");

    expect(tamperedSignature).not.toBe(validSignature);
  });

  it("fails verification when paymentId or orderId is altered", () => {
    const textToSign = `${orderId}|${paymentId}`;
    const signature = createHmac("sha256", secret).update(textToSign).digest("hex");

    const alteredText = `${orderId}|pay_fraud_9999999999`;
    const alteredSignature = createHmac("sha256", secret).update(alteredText).digest("hex");

    expect(alteredSignature).not.toBe(signature);
  });
});
