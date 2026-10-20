import { UserButton } from "@clerk/expo/web";
import { View } from "react-native";

export function ClerkUserBadge() {
  return (
    <View style={{ alignItems: "center", justifyContent: "center" }}>
      <UserButton />
    </View>
  );
}
