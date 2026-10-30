// English-only in R1; every user-facing string goes through t() so R4 localization is additive.
const en = {
  "app.tagline": "Geography, history and knowledge games. Unlimited play. No account needed.",
  "app.comingSoon": "The first games are on their way.",
  "footer.rights": "© {year} {brand}. All rights reserved.",
  "theme.label": "Theme",
  "theme.system": "System",
  "theme.light": "Light",
  "theme.dark": "Dark",
  "footer.legalNav": "Legal",
  "footer.terms": "Terms of Service",
  "footer.privacy": "Privacy Policy",
} as const;

export type MessageKey = keyof typeof en;

export function t(key: MessageKey, params: Record<string, string | number> = {}): string {
  return Object.entries(params).reduce(
    (s, [k, v]) => s.replaceAll(`{${k}}`, String(v)),
    en[key] as string,
  );
}
