import { Feather } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useState } from "react";
import { View } from "react-native";

import { useAuth } from "../auth/AuthContext";
import type { AuthStackParamList } from "../navigation/types";
import { AppText, Banner, Button, Screen, Stack, TextField } from "../ui/components";
import { colors, space } from "../ui/theme";
import { isValidEmail, passwordProblem } from "../lib/validation";

type Props<T extends keyof AuthStackParamList> = NativeStackScreenProps<AuthStackParamList, T>;

export function WelcomeScreen({ navigation }: Props<"Welcome">) {
  const { state } = useAuth();
  const notice = state.status === "signedOut" ? state.notice : null;
  return (
    <Screen safeEdges={["top", "bottom"]} contentStyle={{ flexGrow: 1, justifyContent: "center" }}>
      <Stack gap={space.xl}>
        <View style={{ gap: space.md }}>
          <Feather name="shield" size={40} color={colors.primary} />
          <AppText variant="title">Sehat Med</AppText>
          <AppText style={{ fontSize: 13, color: colors.textMuted, fontWeight: "500", marginTop: -6 }}>
            Bharat ka apna Sathi
          </AppText>
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

function AuthForm({ mode, navigation }: { mode: "signIn" | "register"; navigation: Props<"SignIn" | "Register">["navigation"] }) {
  const { signIn, register, verifyCode } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const isRegister = mode === "register";
  const emailError = touched && !isValidEmail(email) ? "Enter a valid email, like name@example.com." : null;
  const passwordError = touched ? (isRegister ? passwordProblem(password) : password ? null : "Enter your password.") : null;
  const confirmError = touched && isRegister && confirm !== password ? "Passwords do not match." : null;

  async function submit() {
    setTouched(true);
    setFormError(null);
    if (!isValidEmail(email) || (isRegister ? passwordProblem(password) || confirm !== password : !password)) return;
    setBusy(true);
    try {
      if (isRegister) {
        const res = await register(email, password);
        if (res && res.needsVerification) {
          setVerifying(true);
          setBusy(false);
          return;
        }
      } else {
        await signIn(email, password);
      }

    } catch (error: unknown) {
      const err = error as { errors?: { message?: string; longMessage?: string }[]; message?: string };
      const msg = err.errors?.[0]?.longMessage || err.errors?.[0]?.message || err.message || "An authentication error occurred.";
      setFormError(msg);
      setBusy(false);
    }
  }

  async function submitVerification() {
    if (!code.trim()) {
      setFormError("Enter the verification code sent to your email.");
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      await verifyCode(code);
    } catch (error: unknown) {
      const err = error as { errors?: { message?: string; longMessage?: string }[]; message?: string };
      const msg = err.errors?.[0]?.longMessage || err.errors?.[0]?.message || err.message || "Invalid verification code.";
      setFormError(msg);
      setBusy(false);
    }
  }

  if (verifying) {
    return (
      <Screen safeEdges={["bottom"]}>
        <Stack>
          <AppText variant="title" accessibilityRole="header">
            Verify your email
          </AppText>
          <AppText muted>We sent a 6-digit verification code to {email}.</AppText>
          {formError ? <Banner tone="danger" title={formError} icon="alert-circle" /> : null}
          <TextField
            label="Verification code"
            value={code}
            onChangeText={setCode}
            hint="Enter the code sent to your email"
            keyboardType="number-pad"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={() => void submitVerification()}
          />
          <Button label="Verify and continue" onPress={() => void submitVerification()} loading={busy} />
          <Button
            label="Back to registration"
            variant="ghost"
            onPress={() => {
              setVerifying(false);
              setFormError(null);
            }}
          />
        </Stack>
      </Screen>
    );
  }

  return (
    <Screen safeEdges={["bottom"]}>
      <Stack>
        <AppText variant="title" accessibilityRole="header">
          {isRegister ? "Create your account" : "Sign in"}
        </AppText>
        {formError ? <Banner tone="danger" title={formError} icon="alert-circle" /> : null}
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          error={emailError}
          hint="For example: name@example.com"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="username"
          autoComplete="email"
          returnKeyType="next"
        />
        <TextField
          label="Password"
          value={password}
          onChangeText={setPassword}
          error={passwordError}
          hint={isRegister ? "At least 10 characters." : undefined}
          secureTextEntry
          autoCapitalize="none"
          textContentType={isRegister ? "newPassword" : "password"}
          autoComplete={isRegister ? "new-password" : "current-password"}
          returnKeyType={isRegister ? "next" : "go"}
          onSubmitEditing={isRegister ? undefined : () => void submit()}
        />
        {isRegister ? (
          <TextField
            label="Confirm password"
            value={confirm}
            onChangeText={setConfirm}
            error={confirmError}
            secureTextEntry
            autoCapitalize="none"
            textContentType="newPassword"
            returnKeyType="go"
            onSubmitEditing={() => void submit()}
          />
        ) : null}
        <Button label={isRegister ? "Create account" : "Sign in"} onPress={() => void submit()} loading={busy} />
        <Button
          label={isRegister ? "I already have an account" : "Create an account instead"}
          variant="ghost"
          onPress={() => navigation.replace(isRegister ? "SignIn" : "Register")}
        />
      </Stack>
    </Screen>
  );
}

export function SignInScreen({ navigation }: Props<"SignIn">) {
  return <AuthForm mode="signIn" navigation={navigation} />;
}

export function RegisterScreen({ navigation }: Props<"Register">) {
  return <AuthForm mode="register" navigation={navigation} />;
}
