/**
 * Design tokens (UX_AND_DESIGN §5.2). `styles/tokens.css` must match this file; a test enforces it.
 * Brand direction: "Cartographer's desk": warm paper, ink-navy text, restrained terracotta accent.
 */
export const colorTokens = {
  light: {
    bg: "#F7F4EE",
    surface: "#FFFFFF",
    text: "#1A2433",
    "text-muted": "#5A6576",
    accent: "#B4532A",
    "text-on-accent": "#FFFFFF",
    border: "#DDD6C8",
    "border-strong": "#7D8794",
    ocean: "#DCE8EF",
    land: "#EFE9DD",
    "border-map": "#9AA3AE",
    correct: "#1F7A4D",
    wrong: "#B42318",
    near: "#B7791F",
    focus: "#1D4ED8",
  },
  dark: {
    bg: "#12161C",
    surface: "#1B2129",
    text: "#E8ECF1",
    "text-muted": "#9AA6B5",
    accent: "#E07A4F",
    "text-on-accent": "#12161C",
    border: "#2C353F",
    "border-strong": "#7C8896",
    ocean: "#1A2B38",
    land: "#2A3139",
    "border-map": "#5B6673",
    correct: "#4CC38A",
    wrong: "#F97066",
    near: "#F0B429",
    focus: "#93C5FD",
  },
} as const;

export type ColorToken = keyof (typeof colorTokens)["light"];

/** 4 px base scale (px). */
export const space = [4, 8, 12, 16, 24, 32, 48, 64] as const;
export const radius = { control: 6, card: 12 } as const;
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
