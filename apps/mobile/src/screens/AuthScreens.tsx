import { AntDesign, Feather } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useState } from "react";
import { View } from "react-native";

import { describeError, isApiError } from "../api/errors";
import { useAuth } from "../auth/AuthContext";
import type { AuthStackParamList } from "../navigation/types";
import { AppText, Banner, Button, Screen, Stack, TextField } from "../ui/components";
import { colors, space } from "../ui/theme";
import { IS_DEMO } from "../config";
import { isValidEmail, passwordProblem } from "../lib/validation";
import type { DemoAccount } from "../demo/accounts";

/**
 * Demo mode only. These buttons sign in to the in-app synthetic API as a made-up person. They are NOT real
 * Google or Apple sign-in and say so on the button group; they do not exist in live mode.
 */
function DemoShortcuts() {
  const { signInDemo } = useAuth();
  const [busy, setBusy] = useState<DemoAccount["id"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!IS_DEMO) return null;

  async function go(id: DemoAccount["id"]) {
    setBusy(id);
    setError(null);
    try {
      await signInDemo(id);
    } catch (e) {
      const info = describeError(e);
      setError(`${info.title}. ${info.detail}`);
      setBusy(null);
    }
  }

  return (
    <Stack gap={space.md}>
      <Banner tone="demo" title="Demo shortcuts" icon="info">
        These sign you in to sample data inside the app. They are not real Google, Apple or HealthHub accounts, and nothing leaves your phone.
      </Banner>
      <Button label="Quick demo sign-in (sample patient)" icon="zap" onPress={() => void go("patient")} loading={busy === "patient"} disabled={busy !== null} />
      <Button
        label="Continue with Google (demo sandbox)"
        variant="secondary"
        leading={<AntDesign name="google" size={18} color={colors.primary} />}
        onPress={() => void go("google")}
        loading={busy === "google"}
        disabled={busy !== null}
        accessibilityHint="Signs in as a made-up demo person. This is not a real Google sign-in."
      />
      <Button
        label="Continue with Apple (demo sandbox)"
        variant="secondary"
        leading={<AntDesign name="apple" size={18} color={colors.primary} />}
        onPress={() => void go("apple")}
        loading={busy === "apple"}
        disabled={busy !== null}
        accessibilityHint="Signs in as a made-up demo person. This is not a real Apple sign-in."
      />
      {error ? <Banner tone="danger" title={error} icon="alert-circle" /> : null}
    </Stack>
  );
}

type Props<T extends keyof AuthStackParamList> = NativeStackScreenProps<AuthStackParamList, T>;

export function WelcomeScreen({ navigation }: Props<"Welcome">) {
  const { state } = useAuth();
  const notice = state.status === "signedOut" ? state.notice : null;
  return (
    <Screen safeEdges={["top", "bottom"]} contentStyle={{ flexGrow: 1, justifyContent: "center" }}>
      <Stack gap={space.xl}>
        <View style={{ gap: space.md }}>
          <Feather name="shield" size={40} color={colors.primary} />
          <AppText variant="title">HealthHub</AppText>
          <AppText muted>
            Keep your prescriptions, medicine schedule, health history and appointments in one place.
          </AppText>
        </View>
        {notice ? <Banner tone="info" title={notice} icon="info" /> : null}
        {IS_DEMO ? (
          <Banner tone="demo" title="Running in demo mode" icon="info">
            No server is connected. You will see sample data, and sign-in is not a real account.
          </Banner>
        ) : null}
        <Banner tone="warning" title="Prototype for testing" icon="alert-triangle">
          HealthHub is an MVP, not a medical device. Use made-up test data only. It does not give medical advice or change treatment.
        </Banner>
        <Stack gap={space.md}>
          <Button label="Sign in" onPress={() => navigation.navigate("SignIn")} />
          <Button label="Create an account" variant="secondary" onPress={() => navigation.navigate("Register")} />
        </Stack>
        <DemoShortcuts />
      </Stack>
    </Screen>
  );
}

function AuthForm({ mode, navigation }: { mode: "signIn" | "register"; navigation: Props<"SignIn" | "Register">["navigation"] }) {
  const { signIn, register } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
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
      await (isRegister ? register(email, password) : signIn(email, password));
      // Navigation switches automatically when auth state becomes signedIn.
    } catch (error) {
      if (!isRegister && isApiError(error) && error.status === 401) {
        setFormError("The email or password is incorrect.");
      } else if (isApiError(error) && error.code === "VALIDATION_ERROR") {
        setFormError(isRegister ? "Those details weren't accepted. Check the email and password length." : "Check your email and password.");
      } else if (isApiError(error) && error.code === "CONFLICT") {
        setFormError("An account with this email may already exist. Try signing in.");
      } else {
        const info = describeError(error);
        setFormError(`${info.title}. ${info.detail}`);
      }
      setBusy(false);
    }
  }

  return (
    <Screen safeEdges={["bottom"]}>
      <Stack>
        <AppText variant="title" accessibilityRole="header">
          {isRegister ? "Create your account" : "Sign in"}
        </AppText>
        {IS_DEMO ? (
          <Banner tone="demo" title="Demo sign-in" icon="info">
            Use any email and a password of at least 10 characters. No account is created and nothing is stored.
          </Banner>
        ) : null}
        {!isRegister ? <DemoShortcuts /> : null}
        {isRegister ? (
          <Banner tone="warning" title="Use test data only" icon="alert-triangle">
            This prototype is not approved for real patient records.
          </Banner>
        ) : null}
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
