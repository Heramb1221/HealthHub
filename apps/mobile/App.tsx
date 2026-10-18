import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ClerkProvider } from "@clerk/expo";

import { AuthProvider } from "./src/auth/AuthContext";
import { tokenCache } from "./src/auth/tokenCache";
import { RootNavigator } from "./src/navigation/RootNavigator";

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY || "pk_test_d2lubmluZy10dXJ0bGUtMzI3MS5jbGVyay5hY2NvdW50cy5kZXYk";

export default function App() {
  return (
    <SafeAreaProvider>
      <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
        <AuthProvider>
          <StatusBar style="dark" />
          <RootNavigator />
        </AuthProvider>
      </ClerkProvider>
    </SafeAreaProvider>
  );
}
