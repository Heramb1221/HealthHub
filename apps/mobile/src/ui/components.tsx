import { Feather } from "@expo/vector-icons";
import type { ComponentProps, ReactNode } from "react";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, MIN_TOUCH, radius, space, toneStyles, type, type Tone } from "./theme";

export type IconName = ComponentProps<typeof Feather>["name"];

// ---------- Layout ----------
interface ScreenProps {
  children: ReactNode;
  /** Pass for headerless screens (auth) so content clears the notch/home indicator. */
  safeEdges?: ("top" | "bottom")[];
  refreshing?: boolean;
  onRefresh?: () => void;
  contentStyle?: StyleProp<ViewStyle>;
}

/** Scrolling, keyboard-aware screen container. Navigators provide headers and tab bars. */
export function Screen({ children, safeEdges, refreshing, onRefresh, contentStyle }: ScreenProps) {
  const body = (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.screenContent, contentStyle]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      automaticallyAdjustKeyboardInsets
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} /> : undefined}
    >
      {children}
    </ScrollView>
  );
  return (
    <SafeAreaView style={styles.screen} edges={safeEdges ?? []}>
      {body}
    </SafeAreaView>
  );
}

export function Stack({ gap = space.lg, children, style }: { gap?: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ gap }, style]}>{children}</View>;
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Divider() {
  return <View style={styles.divider} />;
}

// ---------- Text ----------
type Variant = keyof typeof type;
interface AppTextProps extends TextProps {
  variant?: Variant;
  muted?: boolean;
  color?: string;
  style?: StyleProp<TextStyle>;
}

export function AppText({ variant = "body", muted, color, style, ...rest }: AppTextProps) {
  return <Text {...rest} style={[type[variant], { color: color ?? (muted ? colors.textMuted : colors.text) }, style]} />;
}

export function Heading({ children, level = 2 }: { children: ReactNode; level?: 1 | 2 }) {
  return (
    <AppText variant={level === 1 ? "title" : "heading"} accessibilityRole="header">
      {children}
    </AppText>
  );
}

// ---------- Buttons ----------
interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}

export function Button({ label, onPress, variant = "primary", icon, loading, disabled, accessibilityHint, style }: ButtonProps) {
  const inactive = Boolean(disabled || loading);
  const palette = buttonPalette[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: Boolean(loading) }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: palette.bg, borderColor: palette.border, opacity: inactive ? 0.5 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={palette.fg} /> : icon ? <Feather name={icon} size={18} color={palette.fg} /> : null}
      <Text style={[type.label, { color: palette.fg, fontSize: 16 }]}>{label}</Text>
    </Pressable>
  );
}

const buttonPalette = {
  primary: { bg: colors.primary, fg: colors.onPrimary, border: colors.primary },
  secondary: { bg: colors.surface, fg: colors.primary, border: colors.primary },
  danger: { bg: colors.surface, fg: colors.danger, border: colors.danger },
  ghost: { bg: "transparent", fg: colors.primary, border: "transparent" },
} as const;

/** Small tappable text row (min touch target) for list rows. */
export function ListRow({
  title,
  subtitle,
  onPress,
  right,
  accessibilityLabel,
}: {
  title: string;
  subtitle?: string;
  onPress?: () => void;
  right?: ReactNode;
  accessibilityLabel?: string;
}) {
  const content = (
    <View style={styles.listRow}>
      <View style={styles.flex}>
        <AppText variant="label">{title}</AppText>
        {subtitle ? (
          <AppText variant="small" muted>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {right}
      {onPress ? <Feather name="chevron-right" size={20} color={colors.textMuted} /> : null}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      {content}
    </Pressable>
  );
}

// ---------- Forms ----------
interface TextFieldProps extends Omit<TextInputProps, "style"> {
  label: string;
  error?: string | null;
  hint?: string;
}

export function TextField({ label, error, hint, ...input }: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <AppText variant="label">{label}</AppText>
      <TextInput
        {...input}
        accessibilityLabel={label}
        accessibilityHint={hint}
        placeholderTextColor={colors.textMuted}
        onFocus={(e) => {
          setFocused(true);
          input.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          input.onBlur?.(e);
        }}
        style={[
          styles.input,
          input.multiline && styles.inputMultiline,
          { borderColor: error ? colors.danger : focused ? colors.focus : colors.inputBorder, borderWidth: focused ? 2 : 1 },
        ]}
      />
      {error ? (
        <AppText variant="small" color={colors.danger} accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="small" muted>
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[styles.chip, selected && { backgroundColor: colors.primary, borderColor: colors.primary }]}
    >
      <Text style={[type.label, { color: selected ? colors.onPrimary : colors.primary }]}>{label}</Text>
    </Pressable>
  );
}

// ---------- Status ----------
export function Badge({ label, tone, icon }: { label: string; tone: Tone; icon?: IconName }) {
  const t = toneStyles[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }]} accessible accessibilityLabel={label}>
      {icon ? <Feather name={icon} size={14} color={t.fg} /> : null}
      <Text style={[type.caption, { color: t.fg, fontWeight: "600" }]}>{label}</Text>
    </View>
  );
}

export function Banner({ tone, title, children, icon }: { tone: Tone; title: string; children?: ReactNode; icon?: IconName }) {
  const t = toneStyles[tone];
  return (
    <View style={[styles.banner, { backgroundColor: t.bg, borderColor: t.fg }]} accessible accessibilityRole="alert">
      <Feather name={icon ?? "info"} size={20} color={t.fg} style={{ marginTop: 2 }} />
      <View style={styles.flex}>
        <AppText variant="label" color={t.fg}>
          {title}
        </AppText>
        {children ? (
          <AppText variant="small" color={t.fg}>
            {children}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

/** Labelled value used on detail screens. Absent values read "Not provided", never invented. */
export function Field({ label, value }: { label: string; value: string }) {
  return (
    <View accessible accessibilityLabel={`${label}: ${value}`} style={{ gap: 2 }}>
      <AppText variant="caption" muted>
        {label}
      </AppText>
      <AppText>{value}</AppText>
    </View>
  );
}

export function DemoTag() {
  return <Badge label="Demo data" tone="demo" icon="info" />;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.background },
  screenContent: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.lg,
    gap: space.md,
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  button: {
    minHeight: MIN_TOUCH,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: space.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
  },
  listRow: { minHeight: MIN_TOUCH, flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.sm },
  field: { gap: space.xs },
  input: {
    minHeight: MIN_TOUCH,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  inputMultiline: { minHeight: 96, textAlignVertical: "top" },
  chip: {
    minHeight: 40,
    paddingHorizontal: space.md,
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    alignSelf: "flex-start",
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.sm,
  },
  banner: { flexDirection: "row", gap: space.md, padding: space.md, borderRadius: radius.md, borderWidth: 1 },
});
