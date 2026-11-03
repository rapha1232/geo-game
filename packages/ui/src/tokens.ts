/**
 * Design tokens (UX_AND_DESIGN §5.2). `styles/tokens.css` must match this file; a test enforces it.
 * Brand direction: "Orbit": cinematic and near-monochrome (Apple-like greys, true black at night), one electric violet accent.
 */
export const colorTokens = {
  light: {
    bg: "#F5F5F7",
    surface: "#FFFFFF",
    text: "#1D1D1F",
    "text-muted": "#5F5F66",
    accent: "#5B2EE6",
    "text-on-accent": "#FFFFFF",
    border: "#E3E3E8",
    "border-strong": "#86868B",
    ocean: "#D8E6FA",
    land: "#F3F1EC",
    "border-map": "#98A0B8",
    correct: "#1F7A4D",
    wrong: "#B42318",
    near: "#B7791F",
    focus: "#0071E3",
  },
  dark: {
    bg: "#000000",
    surface: "#161618",
    text: "#F5F5F7",
    "text-muted": "#A1A1A6",
    accent: "#A48BFF",
    "text-on-accent": "#0A0B1E",
    border: "#2A2A2E",
    "border-strong": "#7C7C82",
    ocean: "#0B1428",
    land: "#26283A",
    "border-map": "#5C6080",
    correct: "#4CC38A",
    wrong: "#F97066",
    near: "#F0B429",
    focus: "#4DA3FF",
  },
} as const;

export type ColorToken = keyof (typeof colorTokens)["light"];

/** 4 px base scale (px). */
export const space = [4, 8, 12, 16, 24, 32, 48, 64] as const;
export const radius = { control: 12, card: 20 } as const;
/** Type scale (rem). */
export const fontScale = [0.75, 0.875, 1, 1.125, 1.375, 1.75, 2.25] as const;
export const motion = {
  micro: 120,
  panel: 200,
  reveal: 400,
  easing: "cubic-bezier(.2,.8,.2,1)",
} as const;
/** Breakpoints (px, min-width) from UX_AND_DESIGN §6. */
export const breakpoints = { md: 640, lg: 1024 } as const;
/** Minimum touch target (px). */
export const touchTarget = 44;
