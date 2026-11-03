import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AuthFlowError,
  authErrorMessage,
  isCodeExpired,
  register,
  resendCode,
  signInWithPassword,
  startPhoneCodeSignIn,
  verifyCode,
  type ClerkClientLike,
} from "../src/auth/clerkFlows.ts";
import {
  fullNameProblem,
  normalizePhoneE164,
  parseLoginIdentifier,
  passwordProblem,
  splitFullName,
} from "../src/lib/validation.ts";
import { configureHttp, request } from "../src/api/http.ts";

type Call = { fn: string; args: unknown };

/** A scripted fake of the Clerk client that records every call. No network, no real Clerk. */
function fakeClerk(script: {
  signInCreate?: Record<string, unknown>;
  signUpCreate?: Record<string, unknown>;
  attemptFirst?: Record<string, unknown>;
  attemptSecond?: Record<string, unknown>;
  attemptEmail?: Record<string, unknown>;
  attemptPhone?: Record<string, unknown>;
}) {
  const calls: Call[] = [];
  const rec = (fn: string, args: unknown) => calls.push({ fn, args });
  const signInState: Record<string, unknown> = { status: null, createdSessionId: null, ...script.signInCreate };
  const signUpState: Record<string, unknown> = { status: null, createdSessionId: null, ...script.signUpCreate };
  const signIn = {
    ...signInState,
    async create(p: Record<string, unknown>) {
      rec("signIn.create", p);
      return signIn;
    },
    async prepareFirstFactor(p: unknown) {
      rec("signIn.prepareFirstFactor", p);
      return signIn;
    },
    async attemptFirstFactor(p: unknown) {
      rec("signIn.attemptFirstFactor", p);
      return { ...signIn, ...script.attemptFirst };
    },
    async prepareSecondFactor(p: unknown) {
      rec("signIn.prepareSecondFactor", p);
      return signIn;
    },
    async attemptSecondFactor(p: unknown) {
      rec("signIn.attemptSecondFactor", p);
      return { ...signIn, ...script.attemptSecond };
    },
  };
  const signUp = {
    ...signUpState,
    async create(p: Record<string, unknown>) {
      rec("signUp.create", p);
      return signUp;
    },
    async prepareEmailAddressVerification(p: unknown) {
      rec("signUp.prepareEmail", p);
      return signUp;
    },
    async preparePhoneNumberVerification(p: unknown) {
      rec("signUp.preparePhone", p);
      return signUp;
    },
    async attemptEmailAddressVerification(p: unknown) {
      rec("signUp.attemptEmail", p);
      return { ...signUp, ...script.attemptEmail };
    },
    async attemptPhoneNumberVerification(p: unknown) {
      rec("signUp.attemptPhone", p);
      return { ...signUp, ...script.attemptPhone };
    },
  };
  return { clerk: { client: { signIn, signUp } } as unknown as ClerkClientLike, calls };
}

describe("passwords are never modified", () => {
  it("sends a long password with inner, leading and trailing spaces to Clerk exactly as typed", async () => {
    const password = `  correct horse battery staple ${"x".repeat(150)}  `;
    const { clerk, calls } = fakeClerk({ signInCreate: { status: "complete", createdSessionId: "sess_1" } });
    const out = await signInWithPassword(clerk, "a@example.com", password);
    assert.deepEqual(out, { status: "complete", sessionId: "sess_1" });
    assert.equal((calls[0]?.args as { password: string }).password, password);
  });

  it("does not length-check passwords on sign-in (only on account creation)", () => {
    assert.equal(passwordProblem("short"), "Use at least 10 characters.");
    assert.equal(passwordProblem("a b c d e f g h i j"), null);
    assert.equal(passwordProblem("p".repeat(256)), null);
    assert.match(passwordProblem("p".repeat(257)) ?? "", /at most 256/);
  });

  it("sends the registration password untouched", async () => {
    const password = " pass word with  spaces ";
    const { clerk, calls } = fakeClerk({ signUpCreate: { status: "complete", createdSessionId: "s" } });
    await register(clerk, { fullName: "A B", email: "a@example.com", password });
    assert.equal((calls[0]?.args as { password: string }).password, password);
  });
});

describe("names", () => {
  it("accepts multiword and Unicode names", () => {
    for (const n of ["Heramb Chaudhari", "Mary Anne van der Berg", "Śrīnivāsa Rāmānujan", "अनिल कुमार शर्मा", "O'Brien-Smith Jr."]) {
      assert.equal(fullNameProblem(n), null, n);
    }
  });
  it("rejects empty, one-character, over-long and control-character names", () => {
    assert.ok(fullNameProblem(""));
    assert.ok(fullNameProblem(" a "));
    assert.ok(fullNameProblem("x".repeat(121)));
    assert.ok(fullNameProblem("Bad\u0000Name"));
  });
  it("splits into first/last without losing any word", () => {
    assert.deepEqual(splitFullName("Heramb"), { firstName: "Heramb" });
    assert.deepEqual(splitFullName("Heramb Chaudhari"), { firstName: "Heramb", lastName: "Chaudhari" });
    assert.deepEqual(splitFullName("  Mary   Anne van der Berg "), { firstName: "Mary", lastName: "Anne van der Berg" });
  });
  it("sends first and last name to Clerk at registration", async () => {
    const { clerk, calls } = fakeClerk({ signUpCreate: { status: "complete", createdSessionId: "s" } });
    await register(clerk, { fullName: "Mary Anne van der Berg", email: " m@example.com ", password: "long enough pw" });
    const a = calls[0]?.args as Record<string, string>;
    assert.equal(a.firstName, "Mary");
    assert.equal(a.lastName, "Anne van der Berg");
    assert.equal(a.emailAddress, "m@example.com");
  });
});

describe("phone numbers", () => {
  it("normalises to E.164", () => {
    assert.equal(normalizePhoneE164("98765 43210"), "+919876543210");
    assert.equal(normalizePhoneE164("098765-43210"), "+919876543210");
    assert.equal(normalizePhoneE164("+91 (98765) 43210"), "+919876543210");
    assert.equal(normalizePhoneE164("919876543210"), "+919876543210");
    assert.equal(normalizePhoneE164("+1 415 555 0132"), "+14155550132");
  });
  it("rejects ambiguous or invalid numbers instead of guessing a country", () => {
    for (const bad of ["", "12345", "5551234567", "+0123456789", "abc", "98765 4321x", "+1234567"]) {
      assert.equal(normalizePhoneE164(bad), null, bad);
    }
  });
  it("tells email and phone identifiers apart", () => {
    assert.deepEqual(parseLoginIdentifier(" a@b.co "), { kind: "email", value: "a@b.co" });
    assert.deepEqual(parseLoginIdentifier("9876543210"), { kind: "phone", value: "+919876543210" });
    assert.equal(parseLoginIdentifier("not an id"), null);
    assert.equal(parseLoginIdentifier("a@b"), null);
  });
});

describe("phone sign-up and verification", () => {
  it("never reports a session until Clerk says complete; verifies by SMS", async () => {
    const { clerk, calls } = fakeClerk({
      signUpCreate: { status: "missing_requirements", unverifiedFields: ["phone_number"] },
      attemptPhone: { status: "complete", createdSessionId: "sess_phone", unverifiedFields: [] },
    });
    const step1 = await register(clerk, { fullName: "A B", phone: "+919876543210", password: "long enough pw" });
    assert.deepEqual(step1, { status: "verify", pending: { kind: "signUpPhone", destination: "+919876543210" } });
    assert.ok(calls.some((c) => c.fn === "signUp.preparePhone" && (c.args as { strategy: string }).strategy === "phone_code"));
    assert.equal((calls[0]?.args as Record<string, string>).phoneNumber, "+919876543210");
    if (step1.status !== "verify") throw new Error("unreachable");
    const step2 = await verifyCode(clerk, step1.pending, " 123 456 ");
    assert.deepEqual(step2, { status: "complete", sessionId: "sess_phone" });
    assert.deepEqual(calls.find((c) => c.fn === "signUp.attemptPhone")?.args, { code: "123456" });
  });

  it("chains a second verification when another field is still unverified", async () => {
    const { clerk } = fakeClerk({
      signUpCreate: { status: "missing_requirements", unverifiedFields: ["email_address"] },
      attemptEmail: { status: "missing_requirements", unverifiedFields: ["phone_number"] },
    });
    const s1 = await register(clerk, { fullName: "A B", email: "a@b.co", password: "long enough pw" });
    if (s1.status !== "verify") throw new Error("expected verify");
    const s2 = await verifyCode(clerk, s1.pending, "111111");
    assert.equal(s2.status, "verify");
    if (s2.status === "verify") assert.equal(s2.pending.kind, "signUpPhone");
  });

  it("fails clearly (no fake success) when sign-up cannot proceed", async () => {
    const { clerk } = fakeClerk({ signUpCreate: { status: "missing_requirements", unverifiedFields: [], missingFields: ["legal_accepted"] } });
    await assert.rejects(register(clerk, { fullName: "A B", email: "a@b.co", password: "long enough pw" }), (e: unknown) => {
      assert.ok(e instanceof AuthFlowError);
      assert.match(e.message, /legal_accepted/);
      return true;
    });
  });

  it("requires an email or a phone number", async () => {
    const { clerk } = fakeClerk({});
    await assert.rejects(register(clerk, { fullName: "A B", password: "long enough pw" }), /email address or a phone number/);
  });

  it("resends the right kind of code", async () => {
    const { clerk, calls } = fakeClerk({});
    await resendCode(clerk, { kind: "signUpPhone", destination: "+91" });
    await resendCode(clerk, { kind: "signUpEmail", destination: "a@b.co" });
    assert.deepEqual(
      calls.map((c) => c.fn),
      ["signUp.preparePhone", "signUp.prepareEmail"],
    );
  });
});

describe("phone-code sign-in and second factors", () => {
  it("sends an SMS code using the phone_code factor Clerk offers", async () => {
    const { clerk, calls } = fakeClerk({
      signInCreate: { status: "needs_first_factor", supportedFirstFactors: [{ strategy: "password" }, { strategy: "phone_code", phoneNumberId: "idn_1" }] },
      attemptFirst: { status: "complete", createdSessionId: "sess_otp" },
    });
    const s1 = await startPhoneCodeSignIn(clerk, "+919876543210");
    assert.deepEqual(calls.find((c) => c.fn === "signIn.prepareFirstFactor")?.args, { strategy: "phone_code", phoneNumberId: "idn_1" });
    if (s1.status !== "verify") throw new Error("expected verify");
    const s2 = await verifyCode(clerk, s1.pending, "654321");
    assert.deepEqual(s2, { status: "complete", sessionId: "sess_otp" });
  });

  it("refuses when the account has no phone_code factor", async () => {
    const { clerk } = fakeClerk({ signInCreate: { status: "needs_first_factor", supportedFirstFactors: [{ strategy: "password" }] } });
    await assert.rejects(startPhoneCodeSignIn(clerk, "+919876543210"), /isn't available for this number/);
  });

  it("does not treat a wrong code as success", async () => {
    const { clerk } = fakeClerk({ attemptFirst: { status: "needs_first_factor", createdSessionId: null } });
    await assert.rejects(verifyCode(clerk, { kind: "signInPhone", destination: "+91" }, "000000"), AuthFlowError);
  });

  it("handles a new-device email code (client trust) as a second factor", async () => {
    const { clerk, calls } = fakeClerk({
      signInCreate: { status: "needs_client_trust", supportedSecondFactors: [{ strategy: "email_code", emailAddressId: "eml_1", safeIdentifier: "a***@b.co" }] },
      attemptSecond: { status: "complete", createdSessionId: "sess_ct" },
    });
    const s1 = await signInWithPassword(clerk, "a@b.co", "pw pw pw pw pw");
    assert.deepEqual(s1, { status: "verify", pending: { kind: "secondFactorEmail", destination: "a***@b.co" } });
    assert.deepEqual(calls.find((c) => c.fn === "signIn.prepareSecondFactor")?.args, { strategy: "email_code", emailAddressId: "eml_1" });
    if (s1.status !== "verify") throw new Error("expected verify");
    const s2 = await verifyCode(clerk, s1.pending, "123456");
    assert.deepEqual(s2, { status: "complete", sessionId: "sess_ct" });
  });

  it("explains unsupported second factors instead of failing silently", async () => {
    const { clerk } = fakeClerk({ signInCreate: { status: "needs_second_factor", supportedSecondFactors: [{ strategy: "totp" }] } });
    await assert.rejects(signInWithPassword(clerk, "a@b.co", "pw pw pw pw pw"), /doesn't support yet/);
  });
});

describe("error messages", () => {
  it("maps common Clerk codes to friendly text and keeps unknown long messages", () => {
    assert.match(authErrorMessage({ errors: [{ code: "form_password_incorrect", message: "x" }] }), /password isn't right/);
    assert.match(authErrorMessage({ errors: [{ code: "verification_expired", message: "x" }] }), /expired/);
    assert.equal(authErrorMessage({ errors: [{ code: "weird", longMessage: "Custom long message." }] }), "Custom long message.");
    assert.match(authErrorMessage(new Error("Network request failed")), /Couldn't reach the server/);
    assert.equal(authErrorMessage(undefined, "fallback"), "fallback");
  });
  it("detects expired codes", () => {
    assert.equal(isCodeExpired({ errors: [{ code: "verification_expired" }] }), true);
    assert.equal(isCodeExpired({ errors: [{ code: "form_code_incorrect" }] }), false);
  });
});

describe("API requests use a fresh token each time", () => {
  it("awaits the async token provider on every request", async () => {
    const seen: (string | null)[] = [];
    let n = 0;
    configureHttp({
      baseUrl: "http://example.test/api/v1",
      getToken: async () => `tok-${++n}`,
      onUnauthorized: () => {},
      fetchImpl: (async (_url: string, init: { headers: Record<string, string> }) => {
        seen.push(init.headers.Authorization ?? null);
        return new Response(JSON.stringify({ data: { ok: true } }), { status: 200, headers: { "Content-Type": "application/json" } });
      }) as unknown as typeof fetch,
    });
    await request("/x");
    await request("/x");
    assert.deepEqual(seen, ["Bearer tok-1", "Bearer tok-2"]);
  });
});
