import { View, Text } from "react-native";
import { Feather } from "@expo/vector-icons";
import { colors } from "../ui/theme";

export function ClerkUserBadge() {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#f1f5f9", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 }}>
      <Feather name="shield" size={12} color={colors.primary} />
      <Text style={{ fontSize: 11, fontWeight: "700", color: colors.primary }}>Clerk Secured</Text>
    </View>
  );
}
