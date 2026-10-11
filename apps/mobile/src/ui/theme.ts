/** Design tokens mirrored from docs/DESIGN_SYSTEM.md and the web app's globals.css. Light theme only. */
export const colors = {
  background: "#f6f5f2",
  surface: "#ffffff",
  text: "#14202e",
  textMuted: "#556070",
  primary: "#12355b",
  onPrimary: "#ffffff",
  secondary: "#e8edf2",
  accent: "#dcecec",
  accentText: "#0e4a4f",
  border: "#d9d5cc",
  inputBorder: "#8c877b",
  focus: "#1f6fb2",
  danger: "#b3261e",
  dangerSurface: "#fbe9e7",
  success: "#1e6b4a",
  successSurface: "#e5f2ec",
  warning: "#7a4f00",
  warningSurface: "#fbf1db",
  info: "#1d5a92",
  infoSurface: "#e3eef8",
  demo: "#5b3f8c",
  demoSurface: "#efe9f7",
  neutralSurface: "#eeece7",
} as const;

/** Spacing scale from the design system: 4, 8, 12, 16, 24, 32. */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 4, md: 8 } as const;

export const type = {
  title: { fontSize: 24, lineHeight: 30, fontWeight: "700" as const },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: "600" as const },
  body: { fontSize: 16, lineHeight: 23, fontWeight: "400" as const },
  label: { fontSize: 14, lineHeight: 20, fontWeight: "600" as const },
  small: { fontSize: 14, lineHeight: 20, fontWeight: "400" as const },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: "400" as const },
};

/** Minimum touch target (iOS HIG 44pt, Android 48dp). */
export const MIN_TOUCH = 48;

export type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "demo";

export const toneStyles: Record<Tone, { fg: string; bg: string }> = {
  neutral: { fg: colors.text, bg: colors.neutralSurface },
  info: { fg: colors.info, bg: colors.infoSurface },
  success: { fg: colors.success, bg: colors.successSurface },
  warning: { fg: colors.warning, bg: colors.warningSurface },
  danger: { fg: colors.danger, bg: colors.dangerSurface },
  demo: { fg: colors.demo, bg: colors.demoSurface },
};
