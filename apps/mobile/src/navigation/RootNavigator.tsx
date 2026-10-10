import { Feather } from "@expo/vector-icons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { DefaultTheme, NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useState } from "react";

import { useAuth } from "../auth/AuthContext";
import { API_CONFIG } from "../config";
import { CareScreen } from "../screens/CareScreen";
import { DashboardScreen } from "../screens/DashboardScreen";
import { HealthCardScreen } from "../screens/HealthCardScreen";
import { HistoryScreen } from "../screens/HistoryScreen";
import { HospitalScreen } from "../screens/HospitalScreen";
import { MedicationScreen } from "../screens/MedicationScreen";
import { PrescriptionDetailScreen } from "../screens/PrescriptionDetailScreen";
import { PrescriptionListScreen } from "../screens/PrescriptionListScreen";
import { PrescriptionUploadScreen } from "../screens/PrescriptionUploadScreen";
import { ProfileScreen } from "../screens/ProfileScreen";
import { RegisterScreen, SignInScreen, WelcomeScreen } from "../screens/AuthScreens";
import { AppText, Banner, Button, Screen, Stack } from "../ui/components";
import { LoadingState } from "../ui/states";
import { colors } from "../ui/theme";
import type { AuthStackParamList, RootStackParamList, TabParamList } from "./types";

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const RootStack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<TabParamList>();

const theme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: colors.background, card: colors.surface, text: colors.text, primary: colors.primary, border: colors.border },
};

const headerOptions = { headerTintColor: colors.primary, headerTitleStyle: { color: colors.text }, headerStyle: { backgroundColor: colors.surface } };

function MainTabs() {
  return (
    <Tabs.Navigator screenOptions={{ ...headerOptions, tabBarActiveTintColor: colors.primary, tabBarInactiveTintColor: colors.textMuted, tabBarLabelStyle: { fontSize: 12 } }}>
      <Tabs.Screen name="Home" component={DashboardScreen} options={{ title: "Home", tabBarIcon: ({ color, size }) => <Feather name="home" color={color} size={size} /> }} />
      <Tabs.Screen name="Prescriptions" component={PrescriptionListScreen} options={{ title: "Prescriptions", tabBarIcon: ({ color, size }) => <Feather name="file-text" color={color} size={size} /> }} />
      <Tabs.Screen name="Medicines" component={MedicationScreen} options={{ title: "Medicines", tabBarIcon: ({ color, size }) => <Feather name="clock" color={color} size={size} /> }} />
      <Tabs.Screen name="Care" component={CareScreen} options={{ title: "Care", tabBarIcon: ({ color, size }) => <Feather name="map-pin" color={color} size={size} /> }} />
      <Tabs.Screen name="Profile" component={ProfileScreen} options={{ title: "Profile", tabBarIcon: ({ color, size }) => <Feather name="user" color={color} size={size} /> }} />
    </Tabs.Navigator>
  );
}

function BlockingScreen({ title, children, actionLabel, onAction }: { title: string; children: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <Screen safeEdges={["top", "bottom"]} contentStyle={{ flexGrow: 1, justifyContent: "center" }}>
      <Stack>
        <AppText variant="title" accessibilityRole="header">{title}</AppText>
        <Banner tone="warning" title={title} icon="alert-triangle">{children}</Banner>
        {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} variant="secondary" /> : null}
      </Stack>
    </Screen>
  );
}

export function RootNavigator() {
  const { state, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  if (API_CONFIG.problem) {
    return <BlockingScreen title="App not configured">{API_CONFIG.problem}</BlockingScreen>;
  }
  if (state.status === "loading") {
    return <Screen safeEdges={["top"]}><LoadingState label="Starting HealthHub…" /></Screen>;
  }
  if (state.status === "signedOut") {
    return (
      <NavigationContainer theme={theme}>
        <AuthStack.Navigator screenOptions={headerOptions}>
          <AuthStack.Screen name="Welcome" component={WelcomeScreen} options={{ headerShown: false }} />
          <AuthStack.Screen name="SignIn" component={SignInScreen} options={{ title: "Sign in" }} />
          <AuthStack.Screen name="Register" component={RegisterScreen} options={{ title: "Create account" }} />
        </AuthStack.Navigator>
      </NavigationContainer>
    );
  }
  if (state.user.role !== "patient") {
    return (
      <BlockingScreen
        title="This app is for patients"
        actionLabel={signingOut ? "Signing out…" : "Sign out"}
        onAction={() => { if (!signingOut) { setSigningOut(true); void signOut(); } }}
      >
        Administrator and provider tools are not part of the mobile app. Sign in with a patient account here.
      </BlockingScreen>
    );
  }
  return (
    <NavigationContainer theme={theme}>
      <RootStack.Navigator screenOptions={headerOptions}>
        <RootStack.Screen name="Tabs" component={MainTabs} options={{ headerShown: false }} />
        <RootStack.Screen name="PrescriptionUpload" component={PrescriptionUploadScreen} options={{ title: "Upload prescription" }} />
        <RootStack.Screen name="PrescriptionDetail" component={PrescriptionDetailScreen} options={{ title: "Prescription" }} />
        <RootStack.Screen name="History" component={HistoryScreen} options={{ title: "Medical history" }} />
        <RootStack.Screen name="HealthCard" component={HealthCardScreen} options={{ title: "Health card" }} />
        <RootStack.Screen name="Hospital" component={HospitalScreen} options={{ title: "Hospital" }} />
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
