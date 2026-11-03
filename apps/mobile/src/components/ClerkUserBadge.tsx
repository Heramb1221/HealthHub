import { View, Text } from "react-native";
import { Feather } from "@expo/vector-icons";
import { colors } from "../ui/theme";

export function ClerkUserBadge() {
  return (
    <View
      accessible
      accessibilityLabel="Secured by Clerk"
      style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.surfaceMuted, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 }}
    >
      <Feather name="shield" size={14} color={colors.primary} />
      <Text style={{ fontSize: 13, fontWeight: "600", color: colors.primary }}>Clerk Secured</Text>
    </View>
  );
}
