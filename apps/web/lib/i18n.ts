// English-only in R1; every user-facing string goes through t() so R4 localization is additive.
const en = {
  "app.tagline": "Geography, history and knowledge games. Unlimited play. No account needed.",
  "app.comingSoon": "The first games are on their way.",
  "footer.rights": "© {year} {brand}. All rights reserved.",
  "notFound.title": "Page not found",
  "notFound.body": "That page does not exist, or it has moved.",
  "notFound.home": "Back to the start",
  "theme.label": "Theme",
  "theme.system": "System",
  "theme.light": "Light",
  "theme.dark": "Dark",
  "footer.legalNav": "Legal",
  "footer.terms": "Terms of Service",
  "footer.privacy": "Privacy Policy",
  "terms.title": "Terms of Service",
  "privacy.title": "Privacy Policy",
  "legal.updated": "Last updated {date}",
  "about.title": "About",
  "about.body":
    "{brand} is a set of geography, history and knowledge games with unlimited play and no account needed. Every name, border and fact comes from a named source, listed on the Sources page.",
  "sources.title": "Sources and licences",
  "sources.intro": "Everything we build on, with its licence and the credit it asks for.",
  "sources.licence": "licence",
  "sources.kind.dataset": "Data",
  "sources.kind.font": "Fonts",
  "sources.kind.icons": "Icons",
  "sources.kind.image": "Images",
  "sources.naturalEarth": "Made with Natural Earth.",
} as const;

export type MessageKey = keyof typeof en;

export function t(key: MessageKey, params: Record<string, string | number> = {}): string {
  return Object.entries(params).reduce(
    (s, [k, v]) => s.replaceAll(`{${k}}`, String(v)),
    en[key] as string,
  );
}
