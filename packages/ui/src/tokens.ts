/**
 * Design tokens (UX_AND_DESIGN §5.2). `styles/tokens.css` must match this file; a test enforces it.
 * Brand direction: "Living atlas": cool daylight paper or deep-space night, ink text, an electric violet accent.
 */
export const colorTokens = {
  light: {
    bg: "#F4F5FB",
    surface: "#FFFFFF",
    text: "#0D1330",
    "text-muted": "#4C5577",
    accent: "#5B2EE6",
    "text-on-accent": "#FFFFFF",
    border: "#E2E4F0",
    "border-strong": "#767E9C",
    ocean: "#D8E6FA",
    land: "#F3F1EC",
    "border-map": "#98A0B8",
    correct: "#1F7A4D",
    wrong: "#B42318",
    near: "#B7791F",
    focus: "#0B63CE",
  },
  dark: {
    bg: "#080A18",
    surface: "#121530",
    text: "#EEF0FF",
    "text-muted": "#A2A8CC",
    accent: "#A48BFF",
    "text-on-accent": "#0A0B1E",
    border: "#252A4A",
    "border-strong": "#7880A8",
    ocean: "#0E1A33",
    land: "#252B49",
    "border-map": "#59618E",
    correct: "#4CC38A",
    wrong: "#F97066",
    near: "#F0B429",
    focus: "#7DD3FC",
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
