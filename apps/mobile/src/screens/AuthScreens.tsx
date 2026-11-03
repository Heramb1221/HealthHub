import { Feather } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";

import { useAuth } from "../auth/AuthContext";
import type { AuthStackParamList } from "../navigation/types";
import { AppText, Banner, Button, Screen, Stack, TextField } from "../ui/components";
import { colors, radius, space } from "../ui/theme";
import { authErrorMessage, isCodeExpired, RESEND_COOLDOWN_SECONDS } from "../auth/clerkFlows.ts";
import {
  fullNameProblem,
  isValidEmail,
  normalizePhoneE164,
  parseLoginIdentifier,
  passwordProblem,
} from "../lib/validation";

type Props<T extends keyof AuthStackParamList> = NativeStackScreenProps<AuthStackParamList, T>;

export function WelcomeScreen({ navigation }: Props<"Welcome">) {
  const { state } = useAuth();
  const notice = state.status === "signedOut" ? state.notice : null;
  return (
    <Screen safeEdges={["top", "bottom"]} contentStyle={{ flexGrow: 1, justifyContent: "center" }}>
      <Stack gap={space.xl}>
        <View style={{ gap: space.md }}>
          <View
            importantForAccessibility="no"
            style={{ width: 72, height: 72, borderRadius: radius.lg, backgroundColor: colors.iconTile, alignItems: "center", justifyContent: "center" }}
          >
            <Feather name="shield" size={36} color={colors.primary} />
          </View>
          <View style={{ gap: space.xs }}>
            <AppText variant="title" accessibilityRole="header">Sehat Meds</AppText>
            <AppText variant="label" color={colors.primary}>Bharat ka apna Saathi</AppText>
          </View>
          <AppText muted>
            Keep your prescriptions, medicine schedule, health history and appointments in one place.
          </AppText>
        </View>
        {notice ? <Banner tone="info" title={notice} icon="info" /> : null}
        <Stack gap={space.md}>
          <Button label="Sign in" onPress={() => navigation.navigate("SignIn")} />
          <Button label="Create an account" variant="secondary" onPress={() => navigation.navigate("Register")} />
        </Stack>
      </Stack>
    </Screen>
  );
}

function VerifyCodeForm({ onBack }: { onBack: () => void }) {
  const { pending, verifyCode, resendCode } = useAuth();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const viaPhone = pending?.kind === "signUpPhone" || pending?.kind === "signInPhone" || pending?.kind === "secondFactorPhone";

  async function submit() {
    if (busy) return;
    if (!code.replace(/\s+/g, "")) {
      setError("Enter the verification code.");
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const outcome = await verifyCode(code);
      if (outcome.status === "verify") {
        // e.g. email verified, phone still to verify
        setCode("");
        setCooldown(RESEND_COOLDOWN_SECONDS);
        setInfo("Thanks. One more code is needed to finish.");
      }
    } catch (e: unknown) {
      setExpired(isCodeExpired(e));
      setError(authErrorMessage(e, "That code didn't work. Check it and try again."));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (resending || cooldown > 0) return;
    setResending(true);
    setError(null);
    setInfo(null);
    try {
      await resendCode();
      setExpired(false);
      setCode("");
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setInfo(`We sent a new code to ${pending?.destination ?? "you"}.`);
    } catch (e: unknown) {
      setError(authErrorMessage(e, "Couldn't send a new code. Try again shortly."));
    } finally {
      setResending(false);
    }
  }

  return (
    <Screen safeEdges={["bottom"]}>
      <Stack>
        <AppText variant="title" accessibilityRole="header">
          {viaPhone ? "Verify your phone number" : "Verify your email"}
        </AppText>
        <AppText muted>We sent a verification code to {pending?.destination ?? "you"}. It expires after a few minutes.</AppText>
        {error ? <Banner tone="danger" title={error} icon="alert-circle" /> : null}
        {info ? <Banner tone="info" title={info} icon="info" /> : null}
        <TextField
          label="Verification code"
          value={code}
          onChangeText={setCode}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={() => void submit()}
        />
        <Button label="Verify and continue" onPress={() => void submit()} loading={busy} />
        <Button
          label={cooldown > 0 ? `Resend code in ${cooldown}s` : expired ? "Send a new code" : "Resend code"}
          variant="secondary"
          disabled={cooldown > 0 || resending}
          loading={resending}
          onPress={() => void resend()}
        />
        <Button label="Start over" variant="ghost" onPress={onBack} />
      </Stack>
    </Screen>
  );
}

function SignInForm({ navigation }: { navigation: Props<"SignIn">["navigation"] }) {
  const { signIn, startPhoneSignIn, pending, cancelVerification } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const parsed = parseLoginIdentifier(identifier);
  const idError = touched && !parsed ? "Enter an email address like name@example.com or a phone number." : null;
  // Passwords are never trimmed or length-checked on sign-in; Clerk decides.
  const passwordError = touched && !password ? "Enter your password." : null;

  async function submit() {
    if (busy) return;
    setTouched(true);
    setFormError(null);
    if (!parsed || !password) return;
    setBusy(true);
    try {
      await signIn(parsed.value, password);
    } catch (e: unknown) {
      setFormError(authErrorMessage(e, "Couldn't sign you in. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  async function sendCode() {
    if (busy) return;
    setTouched(true);
    setFormError(null);
    if (!parsed || parsed.kind !== "phone") {
      setFormError("To get a code by SMS, enter your phone number above.");
      return;
    }
    setBusy(true);
    try {
      await startPhoneSignIn(parsed.value);
    } catch (e: unknown) {
      setFormError(authErrorMessage(e, "Couldn't send a code. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  if (pending) return <VerifyCodeForm onBack={cancelVerification} />;

  return (
    <Screen safeEdges={["bottom"]}>
      <Stack>
        <AppText variant="title" accessibilityRole="header">
          Sign in
        </AppText>
        {formError ? <Banner tone="danger" title={formError} icon="alert-circle" /> : null}
        <TextField
          label="Email or phone number"
          value={identifier}
          onChangeText={setIdentifier}
          error={idError}
          hint="For example: name@example.com or +91 98765 43210"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="username"
          autoComplete="username"
          returnKeyType="next"
        />
        <TextField
          label="Password"
          value={password}
          onChangeText={setPassword}
          error={passwordError}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="password"
          autoComplete="current-password"
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
        />
        <Button label="Sign in" onPress={() => void submit()} loading={busy} />
        <Button label="Sign in with an SMS code instead" variant="secondary" disabled={busy} onPress={() => void sendCode()} />
        <Button label="Create an account instead" variant="ghost" onPress={() => navigation.replace("Register")} />
      </Stack>
    </Screen>
  );
}

function RegisterForm({ navigation }: { navigation: Props<"Register">["navigation"] }) {
  const { register, pending, cancelVerification } = useAuth();
  const [method, setMethod] = useState<"email" | "phone">("email");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const nameError = touched ? fullNameProblem(fullName) : null;
  const emailError = touched && method === "email" && !isValidEmail(email) ? "Enter a valid email, like name@example.com." : null;
  const phoneE164 = normalizePhoneE164(phone);
  const phoneError =
    touched && method === "phone" && !phoneE164 ? "Enter a mobile number, with the country code if it isn't an Indian number (+…)." : null;
  const passwordError = touched ? passwordProblem(password) : null;
  const confirmError = touched && confirm !== password ? "Passwords do not match." : null;

  const submit = useCallback(async () => {
    if (busy) return;
    setTouched(true);
    setFormError(null);
    const invalid =
      fullNameProblem(fullName) ||
      (method === "email" ? !isValidEmail(email) : !phoneE164) ||
      passwordProblem(password) ||
      confirm !== password;
    if (invalid) return;
    setBusy(true);
    try {
      await register({
        fullName,
        password,
        ...(method === "email" ? { email } : { phone: phoneE164 ?? undefined }),
      });
    } catch (e: unknown) {
      setFormError(authErrorMessage(e, "Couldn't create your account. Please try again."));
    } finally {
      setBusy(false);
    }
  }, [busy, fullName, method, email, phoneE164, password, confirm, register]);

  if (pending) return <VerifyCodeForm onBack={cancelVerification} />;

  return (
    <Screen safeEdges={["bottom"]}>
      <Stack>
        <AppText variant="title" accessibilityRole="header">
          Create your account
        </AppText>
        {formError ? <Banner tone="danger" title={formError} icon="alert-circle" /> : null}
        <TextField
          label="Full name"
          value={fullName}
          onChangeText={setFullName}
          error={nameError}
          hint="As on your ID. Spaces are fine."
          autoCapitalize="words"
          textContentType="name"
          autoComplete="name"
          returnKeyType="next"
        />
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <View style={{ flex: 1 }}>
            <Button label="Use email" variant={method === "email" ? "primary" : "secondary"} onPress={() => setMethod("email")} />
          </View>
          <View style={{ flex: 1 }}>
            <Button label="Use phone" variant={method === "phone" ? "primary" : "secondary"} onPress={() => setMethod("phone")} />
          </View>
        </View>
        {method === "email" ? (
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            error={emailError}
            hint="For example: name@example.com"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
            returnKeyType="next"
          />
        ) : (
          <TextField
            label="Phone number"
            value={phone}
            onChangeText={setPhone}
            error={phoneError}
            hint="We'll text you a code. Example: +91 98765 43210"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            autoComplete="tel"
            returnKeyType="next"
          />
        )}
        <TextField
          label="Password"
          value={password}
          onChangeText={setPassword}
          error={passwordError}
          hint="At least 10 characters. Spaces are allowed."
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="newPassword"
          autoComplete="new-password"
          returnKeyType="next"
        />
        <TextField
          label="Confirm password"
          value={confirm}
          onChangeText={setConfirm}
          error={confirmError}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
        />
        <Button label="Create account" onPress={() => void submit()} loading={busy} />
        <Button label="I already have an account" variant="ghost" onPress={() => navigation.replace("SignIn")} />
      </Stack>
    </Screen>
  );
}

export function SignInScreen({ navigation }: Props<"SignIn">) {
  return <SignInForm navigation={navigation} />;
}

export function RegisterScreen({ navigation }: Props<"Register">) {
  return <RegisterForm navigation={navigation} />;
}
