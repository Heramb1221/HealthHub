import { splitFullName } from "../lib/validation.ts";

/**
 * Clerk sign-in / sign-up flows used by the mobile app.
 *
 * These functions only call methods that exist on Clerk's client resources
 * (`signIn.create`, `prepareFirstFactor`, `attemptFirstFactor`, `signUp.create`,
 * `prepareEmailAddressVerification`, `preparePhoneNumberVerification`, ...). They never
 * bypass verification: a session is only reported once Clerk itself says `complete`.
 * Passwords are passed to Clerk exactly as typed.
 */

export type VerificationKind = "signUpEmail" | "signUpPhone" | "signInPhone" | "secondFactorEmail" | "secondFactorPhone";

export interface PendingVerification {
  kind: VerificationKind;
  /** Where the code was sent, for display only (e.g. an email address or "+91…"). */
  destination: string;
}

export type FlowOutcome = { status: "complete"; sessionId: string } | { status: "verify"; pending: PendingVerification };

type Factor = { strategy: string; phoneNumberId?: string; emailAddressId?: string; safeIdentifier?: string };

interface SignInLike {
  status: string | null;
  createdSessionId: string | null;
  supportedFirstFactors?: Factor[] | null;
  supportedSecondFactors?: Factor[] | null;
  prepareFirstFactor(p: { strategy: "phone_code"; phoneNumberId: string }): Promise<SignInLike>;
  attemptFirstFactor(p: { strategy: "phone_code"; code: string }): Promise<SignInLike>;
  prepareSecondFactor(p: { strategy: "phone_code" | "email_code"; phoneNumberId?: string; emailAddressId?: string }): Promise<SignInLike>;
  attemptSecondFactor(p: { strategy: "phone_code" | "email_code"; code: string }): Promise<SignInLike>;
}

interface SignUpLike {
  status: string | null;
  createdSessionId: string | null;
  unverifiedFields?: string[];
  missingFields?: string[];
  prepareEmailAddressVerification(p: { strategy: "email_code" }): Promise<SignUpLike>;
  preparePhoneNumberVerification(p: { strategy: "phone_code" }): Promise<SignUpLike>;
  attemptEmailAddressVerification(p: { code: string }): Promise<SignUpLike>;
  attemptPhoneNumberVerification(p: { code: string }): Promise<SignUpLike>;
}

export interface ClerkClientLike {
  client: {
    signIn: SignInLike & { create(p: Record<string, unknown>): Promise<SignInLike> };
    signUp: SignUpLike & { create(p: Record<string, unknown>): Promise<SignUpLike> };
  };
}

export class AuthFlowError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "AuthFlowError";
    this.code = code;
  }
}

const FRIENDLY: Record<string, string> = {
  form_identifier_not_found: "We couldn't find an account with those details. Check them or create an account.",
  form_password_incorrect: "That password isn't right. Check it and try again.",
  form_password_pwned: "That password has appeared in a known data breach. Choose a different one.",
  form_password_length_too_short: "That password is too short for this account.",
  form_password_length_too_long: "That password is longer than this account allows.",
  form_identifier_exists: "An account with those details already exists. Try signing in instead.",
  form_code_incorrect: "That code isn't right. Check it and try again.",
  verification_failed: "That code isn't right. Check it and try again.",
  verification_expired: "That code has expired. Request a new one.",
  too_many_requests: "Too many attempts. Wait a minute and try again.",
  session_exists: "You're already signed in.",
};

interface ClerkErrorShape {
  errors?: { code?: string; message?: string; longMessage?: string }[];
  message?: string;
}

/** Turn an unknown error from Clerk (or this module) into a message that is safe and useful to show. */
export function authErrorMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
  if (error instanceof AuthFlowError) return error.message;
  const e = error as ClerkErrorShape | null;
  const first = e?.errors?.[0];
  const friendly = first?.code ? FRIENDLY[first.code] : undefined;
  if (friendly) return friendly;
  if (first?.longMessage) return first.longMessage;
  if (first?.message) return first.message;
  if (e?.message && !/network request failed/i.test(e.message)) return e.message;
  if (e?.message) return "Couldn't reach the server. Check your connection and try again.";
  return fallback;
}

/** True when the error means the code is expired or the attempt must be restarted/resent. */
export function isCodeExpired(error: unknown): boolean {
  const code = (error as ClerkErrorShape | null)?.errors?.[0]?.code;
  return code === "verification_expired";
}

function completeOrThrow(status: string | null, sessionId: string | null, incompleteMessage: string): FlowOutcome {
  if (status === "complete" && sessionId) return { status: "complete", sessionId };
  throw new AuthFlowError("incomplete", incompleteMessage);
}

async function startSecondFactor(signIn: SignInLike): Promise<FlowOutcome> {
  const factors = signIn.supportedSecondFactors ?? [];
  const phone = factors.find((f) => f.strategy === "phone_code" && f.phoneNumberId);
  const phoneId = phone?.phoneNumberId;
  if (phone && phoneId) {
    await signIn.prepareSecondFactor({ strategy: "phone_code", phoneNumberId: phoneId });
    return { status: "verify", pending: { kind: "secondFactorPhone", destination: phone.safeIdentifier ?? "your phone" } };
  }
  const email = factors.find((f) => f.strategy === "email_code" && f.emailAddressId);
  const emailId = email?.emailAddressId;
  if (email && emailId) {
    await signIn.prepareSecondFactor({ strategy: "email_code", emailAddressId: emailId });
    return { status: "verify", pending: { kind: "secondFactorEmail", destination: email.safeIdentifier ?? "your email" } };
  }
  throw new AuthFlowError(
    "unsupported_second_factor",
    "This account needs an extra sign-in step (such as an authenticator app) that the mobile app doesn't support yet. Use the website to sign in.",
  );
}

async function afterSignIn(signIn: SignInLike): Promise<FlowOutcome> {
  if (signIn.status === "complete" && signIn.createdSessionId) return { status: "complete", sessionId: signIn.createdSessionId };
  if (signIn.status === "needs_second_factor" || signIn.status === "needs_client_trust") return startSecondFactor(signIn);
  if (signIn.status === "needs_new_password") {
    throw new AuthFlowError("needs_new_password", "You need to set a new password. Use “Forgot password” on the website, then sign in again.");
  }
  throw new AuthFlowError("incomplete", "Sign-in could not be completed. Please try again.");
}

/** Sign in with an email address or E.164 phone number plus password. The password is sent untouched. */
export async function signInWithPassword(clerk: ClerkClientLike, identifier: string, password: string): Promise<FlowOutcome> {
  const signIn = await clerk.client.signIn.create({ identifier, password });
  return afterSignIn(signIn);
}

/** Start a passwordless phone sign-in: Clerk sends a one-time code by SMS. */
export async function startPhoneCodeSignIn(clerk: ClerkClientLike, phoneE164: string): Promise<FlowOutcome> {
  const signIn = await clerk.client.signIn.create({ identifier: phoneE164 });
  const factor = (signIn.supportedFirstFactors ?? []).find((f) => f.strategy === "phone_code" && f.phoneNumberId);
  if (!factor?.phoneNumberId) {
    throw new AuthFlowError(
      "phone_code_unavailable",
      "Phone sign-in isn't available for this number. Check the number, or sign in with your email and password.",
    );
  }
  await signIn.prepareFirstFactor({ strategy: "phone_code", phoneNumberId: factor.phoneNumberId });
  return { status: "verify", pending: { kind: "signInPhone", destination: phoneE164 } };
}

export interface RegisterInput {
  fullName: string;
  email?: string;
  phone?: string;
  password?: string;
}

async function nextSignUpStep(signUp: SignUpLike, destinations: { email?: string; phone?: string }): Promise<FlowOutcome> {
  if (signUp.status === "complete" && signUp.createdSessionId) return { status: "complete", sessionId: signUp.createdSessionId };
  const unverified = signUp.unverifiedFields ?? [];
  if (unverified.includes("phone_number")) {
    await signUp.preparePhoneNumberVerification({ strategy: "phone_code" });
    return { status: "verify", pending: { kind: "signUpPhone", destination: destinations.phone ?? "your phone" } };
  }
  if (unverified.includes("email_address")) {
    await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
    return { status: "verify", pending: { kind: "signUpEmail", destination: destinations.email ?? "your email" } };
  }
  const missing = signUp.missingFields?.length ? ` Missing: ${signUp.missingFields.join(", ")}.` : "";
  throw new AuthFlowError("incomplete", `Sign-up needs more information that this app can't collect yet.${missing}`);
}

export async function register(clerk: ClerkClientLike, input: RegisterInput): Promise<FlowOutcome> {
  if (!input.email && !input.phone) throw new AuthFlowError("identifier_required", "Enter an email address or a phone number.");
  const { firstName, lastName } = splitFullName(input.fullName);
  const params: Record<string, unknown> = { firstName };
  if (lastName) params.lastName = lastName;
  if (input.email) params.emailAddress = input.email.trim();
  if (input.phone) params.phoneNumber = input.phone;
  if (input.password !== undefined && input.password !== "") params.password = input.password;
  const signUp = await clerk.client.signUp.create(params);
  return nextSignUpStep(signUp, { email: input.email?.trim(), phone: input.phone });
}

/** Submit a one-time code for whichever verification is pending. Codes are stripped of spaces only. */
export async function verifyCode(clerk: ClerkClientLike, pending: PendingVerification, rawCode: string): Promise<FlowOutcome> {
  const code = rawCode.replace(/\s+/g, "");
  if (!code) throw new AuthFlowError("code_required", "Enter the verification code.");
  const { signIn, signUp } = clerk.client;
  switch (pending.kind) {
    case "signUpEmail": {
      const r = await signUp.attemptEmailAddressVerification({ code });
      return nextSignUpStep(r, { email: pending.destination });
    }
    case "signUpPhone": {
      const r = await signUp.attemptPhoneNumberVerification({ code });
      return nextSignUpStep(r, { phone: pending.destination });
    }
    case "signInPhone": {
      const r = await signIn.attemptFirstFactor({ strategy: "phone_code", code });
      return completeOrThrow(r.status, r.createdSessionId, "That code could not be accepted. Request a new one.");
    }
    case "secondFactorPhone": {
      const r = await signIn.attemptSecondFactor({ strategy: "phone_code", code });
      return completeOrThrow(r.status, r.createdSessionId, "That code could not be accepted. Request a new one.");
    }
    case "secondFactorEmail": {
      const r = await signIn.attemptSecondFactor({ strategy: "email_code", code });
      return completeOrThrow(r.status, r.createdSessionId, "That code could not be accepted. Request a new one.");
    }
  }
}

/** Ask Clerk to send a fresh code for the pending verification. */
export async function resendCode(clerk: ClerkClientLike, pending: PendingVerification): Promise<void> {
  const { signIn, signUp } = clerk.client;
  switch (pending.kind) {
    case "signUpEmail":
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      return;
    case "signUpPhone":
      await signUp.preparePhoneNumberVerification({ strategy: "phone_code" });
      return;
    case "signInPhone": {
      const factor = (signIn.supportedFirstFactors ?? []).find((f) => f.strategy === "phone_code" && f.phoneNumberId);
      if (!factor?.phoneNumberId) throw new AuthFlowError("phone_code_unavailable", "Start phone sign-in again to get a new code.");
      await signIn.prepareFirstFactor({ strategy: "phone_code", phoneNumberId: factor.phoneNumberId });
      return;
    }
    case "secondFactorPhone":
    case "secondFactorEmail":
      await startSecondFactor(signIn);
      return;
  }
}

/** Seconds a client should wait before offering "Resend code" again. */
export const RESEND_COOLDOWN_SECONDS = 30;
