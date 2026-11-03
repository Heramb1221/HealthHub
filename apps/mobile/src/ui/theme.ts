
export const colors = {
  background: "#f2f7f6",
  surface: "#ffffff",
  text: "#0d1b2e",
  textMuted: "#4c5b6b",
  primary: "#0a6b60",
  onPrimary: "#ffffff",
  secondary: "#e6eef5",
  accent: "#dcf3ea",
  accentText: "#07524a",
  border: "#d3e0df",
  inputBorder: "#6f8886",
  focus: "#1a7f9e",
  danger: "#b3261e",
  dangerSurface: "#fbe9e7",
  success: "#17653f",
  successSurface: "#e5f2ec",
  warning: "#7a4f00",
  warningSurface: "#fbf1db",
  info: "#1d5a92",
  infoSurface: "#e3eef8",
  demo: "#5b3f8c",
  demoSurface: "#efe9f7",
  neutralSurface: "#e9f0ef",
  /** Deep navy from the logo, for headings and secondary emphasis. */
  navy: "#0b3475",
  /** Tinted panel behind grouped content, one step off the page background. */
  surfaceMuted: "#f6faf9",
  /** Tint behind leading icons in list rows. */
  iconTile: "#e4f1ee",
  /** Hairline separators inside cards. */
  divider: "#e3ecea",
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

/**
 * Type scale tuned for phone reading distance: nothing below 13px, body at 16px,
 * generous line heights. Keys are used as AppText variants, so keep them stable.
 */
export const type = {
  title: { fontSize: 26, lineHeight: 32, fontWeight: "700" as const },
  heading: { fontSize: 19, lineHeight: 25, fontWeight: "600" as const },
  body: { fontSize: 16, lineHeight: 24, fontWeight: "400" as const },
  label: { fontSize: 15, lineHeight: 21, fontWeight: "600" as const },
  small: { fontSize: 15, lineHeight: 21, fontWeight: "400" as const },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: "400" as const },
};

/** Soft, single-layer elevation shared by cards and floating surfaces. */
export const elevation = {
  shadowColor: "#0d1b2e",
  shadowOpacity: 0.05,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 1,
} as const;

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
