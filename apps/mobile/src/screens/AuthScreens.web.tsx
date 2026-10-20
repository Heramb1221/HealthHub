import { Feather } from "@expo/vector-icons";
import { SignIn, SignUp } from "@clerk/expo/web";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Image, View } from "react-native";

import { useAuth } from "../auth/AuthContext";
import type { AuthStackParamList } from "../navigation/types";
import { AppText, Banner, Button, Screen, Stack } from "../ui/components";
import { colors, space } from "../ui/theme";

type Props<T extends keyof AuthStackParamList> = NativeStackScreenProps<AuthStackParamList, T>;

export function WelcomeScreen({ navigation }: Props<"Welcome">) {
  const { state } = useAuth();
  const notice = state.status === "signedOut" ? state.notice : null;

  return (
    <Screen safeEdges={["top", "bottom"]} contentStyle={{ flexGrow: 1, justifyContent: "center", alignItems: "center" }}>
      <Stack gap={space.xl} style={{ maxWidth: 440, width: "100%", paddingHorizontal: space.md }}>
        <View style={{ gap: space.sm, alignItems: "center" }}>
          <Image
            source={require("../../assets/icon.png")}
            style={{ width: 64, height: 64, borderRadius: 14 }}
            resizeMode="contain"
          />
          <AppText variant="title" style={{ fontSize: 28, textAlign: "center" }}>
            Sehat Med
          </AppText>
          <AppText style={{ fontSize: 14, color: colors.textMuted, fontWeight: "500", marginTop: -6, textAlign: "center" }}>
            Bharat ka apna Sathi
          </AppText>
          <AppText muted style={{ textAlign: "center" }}>
            Keep your prescriptions, medicine schedule, health history and appointments in one place.
          </AppText>
        </View>

        {notice ? <Banner tone="info" title={notice} icon="info" /> : null}

        <Stack gap={space.md}>
          <Button label="Sign in with Clerk" onPress={() => navigation.navigate("SignIn")} />
          <Button label="Create an account" variant="secondary" onPress={() => navigation.navigate("Register")} />
        </Stack>

        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <Feather name="lock" size={13} color={colors.textMuted} />
          <AppText style={{ fontSize: 12, color: colors.textMuted }}>
            Secured by Clerk Authentication
          </AppText>
        </View>
      </Stack>
    </Screen>
  );
}

export function SignInScreen({ navigation }: Props<"SignIn">) {
  return (
    <Screen safeEdges={["top", "bottom"]} contentStyle={{ flexGrow: 1, justifyContent: "center", alignItems: "center", paddingVertical: space.lg }}>
      <Stack gap={space.lg} style={{ alignItems: "center", width: "100%" }}>
        <SignIn
          routing="hash"
          signUpUrl="#/register"
          fallbackRedirectUrl="/"
        />
        <Button
          label="Need an account? Create one"
          variant="ghost"
          onPress={() => navigation.replace("Register")}
        />
      </Stack>
    </Screen>
  );
}

export function RegisterScreen({ navigation }: Props<"Register">) {
  return (
    <Screen safeEdges={["top", "bottom"]} contentStyle={{ flexGrow: 1, justifyContent: "center", alignItems: "center", paddingVertical: space.lg }}>
      <Stack gap={space.lg} style={{ alignItems: "center", width: "100%" }}>
        <SignUp
          routing="hash"
          signInUrl="#/sign-in"
          fallbackRedirectUrl="/"
        />
        <Button
          label="I already have an account"
          variant="ghost"
          onPress={() => navigation.replace("SignIn")}
        />
      </Stack>
    </Screen>
  );
}
