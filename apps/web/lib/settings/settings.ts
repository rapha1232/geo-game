import type { MeridianDb } from "../storage/db";

export type Units = "auto" | "km" | "mi";
export type Strictness = "lenient" | "standard" | "strict";
export type CountrySet = "sovereign-197" | "un-193";

/** UX_AND_DESIGN §3.6. Theme lives in its own key (`meridian:theme`) so it can apply before the page paints. */
export type Settings = {
  units: Units;
  /** "system" follows the OS; "reduce" turns movement off whatever the OS says. */
  reducedMotion: "system" | "reduce";
  strictness: Strictness;
  countrySet: CountrySet;
  highContrast: boolean;
  accessibleDefault: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  units: "auto",
  reducedMotion: "system",
  strictness: "standard",
  countrySet: "sovereign-197",
  highContrast: false,
  accessibleDefault: false,
};

/** The key inside the single `settings` record. Other keys there belong to games (`quiz:*`, `fact-pin`). */
export const PREFS_KEY = "prefs";

const UNITS: readonly Units[] = ["auto", "km", "mi"];
const STRICT: readonly Strictness[] = ["lenient", "standard", "strict"];
const SETS: readonly CountrySet[] = ["sovereign-197", "un-193"];

/** Keeps only valid values, so an old or hand-edited record never breaks the app. */
export function sanitize(raw: unknown): Settings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const pick = <T extends string>(v: unknown, ok: readonly T[], d: T): T =>
    ok.includes(v as T) ? (v as T) : d;
  return {
    units: pick(r["units"], UNITS, DEFAULT_SETTINGS.units),
    reducedMotion: r["reducedMotion"] === "reduce" ? "reduce" : "system",
    strictness: pick(r["strictness"], STRICT, DEFAULT_SETTINGS.strictness),
    countrySet: pick(r["countrySet"], SETS, DEFAULT_SETTINGS.countrySet),
    highContrast: r["highContrast"] === true,
    accessibleDefault: r["accessibleDefault"] === true,
  };
}

/** Miles for the countries that still road-sign in them; kilometres everywhere else. */
export function unitForLocale(locale: string | undefined): "km" | "mi" {
  const region = locale?.split(/[-_]/)[1]?.toUpperCase();
  return region === "US" || region === "GB" || region === "LR" || region === "MM" ? "mi" : "km";
}

export const resolveUnits = (s: Settings, locale: string | undefined): "km" | "mi" =>
  s.units === "auto" ? unitForLocale(locale) : s.units;

export async function loadSettings(db: MeridianDb): Promise<Settings> {
  try {
    const rec = await db.settings.get("settings");
    return sanitize(rec?.value?.[PREFS_KEY]);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(db: MeridianDb, s: Settings): Promise<boolean> {
  try {
    const rec = await db.settings.get("settings");
    await db.settings.put({ key: "settings", value: { ...(rec?.value ?? {}), [PREFS_KEY]: s } });
    return true;
  } catch {
    return false;
  }
}

/** Applies the settings that are CSS attributes on `<html>` (tokens.css and base.css read them). */
export function applySettings(s: Settings, root: HTMLElement = document.documentElement): void {
  if (s.reducedMotion === "reduce") root.setAttribute("data-motion", "reduce");
  else root.removeAttribute("data-motion");
  if (s.highContrast) root.setAttribute("data-contrast", "high");
  else root.removeAttribute("data-contrast");
}

export const browserLocale = (): string | undefined =>
  typeof navigator === "undefined" ? undefined : navigator.language;
