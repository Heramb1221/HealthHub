import { Feather } from "@expo/vector-icons";
import { ActivityIndicator, Linking, View } from "react-native";

import { describeError } from "../api/errors";
import { AppText, Button, Stack, type IconName } from "./components";
import { colors, space } from "./theme";

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <View style={{ padding: space.xl, alignItems: "center", gap: space.md }} accessible accessibilityLabel={label} accessibilityLiveRegion="polite">
      <ActivityIndicator size="large" color={colors.primary} />
      <AppText muted>{label}</AppText>
    </View>
  );
}

export function EmptyState({ icon = "inbox", title, body, action }: { icon?: IconName; title: string; body: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={{ padding: space.xl, alignItems: "center", gap: space.md }}>
      <Feather name={icon} size={32} color={colors.textMuted} />
      <AppText variant="heading" style={{ textAlign: "center" }}>
        {title}
      </AppText>
      <AppText muted style={{ textAlign: "center" }}>
        {body}
      </AppText>
      {action ? <Button label={action.label} onPress={action.onPress} variant="secondary" /> : null}
    </View>
  );
}

/** Network/server error with a retry action when retrying can help. */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const info = describeError(error);
  return (
    <View style={{ padding: space.xl, gap: space.md, alignItems: "center" }} accessibilityRole="alert">
      <Feather name="alert-triangle" size={32} color={colors.danger} />
      <AppText variant="heading" style={{ textAlign: "center" }}>
        {info.title}
      </AppText>
      <AppText muted style={{ textAlign: "center" }}>
        {info.detail}
      </AppText>
      {info.requestId ? (
        <AppText variant="caption" muted selectable>
          Reference: {info.requestId}
        </AppText>
      ) : null}
      {onRetry && info.retryable ? <Button label="Try again" icon="refresh-cw" onPress={onRetry} variant="secondary" /> : null}
    </View>
  );
}

/** Shown when the user denied a device permission. Offers the OS settings, never a fake workaround. */
export function PermissionDenied({ what, why }: { what: string; why: string }) {
  return (
    <Stack gap={space.md} style={{ padding: space.lg }}>
      <View style={{ alignItems: "center", gap: space.sm }}>
        <Feather name="lock" size={28} color={colors.warning} />
        <AppText variant="heading" style={{ textAlign: "center" }}>
          {what} access is off
        </AppText>
        <AppText muted style={{ textAlign: "center" }}>
          {why}
        </AppText>
      </View>
      <Button label="Open settings" icon="settings" variant="secondary" onPress={() => void Linking.openSettings()} />
    </Stack>
  );
}
