/** Theme preference: follow the system, or force light or dark (tokens.css reads `data-theme`). */
export type ThemePreference = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "meridian:theme";
export const THEME_OPTIONS: readonly ThemePreference[] = ["system", "light", "dark"];

const isPreference = (v: unknown): v is ThemePreference =>
  v === "system" || v === "light" || v === "dark";

/** Storage can throw or be absent (private windows, blocked site data), so every access is guarded. */
export function readThemePreference(
  storage: Pick<Storage, "getItem"> | undefined = safeStorage(),
): ThemePreference {
  try {
    const v = storage?.getItem(THEME_STORAGE_KEY);
    return isPreference(v) ? v : "system";
  } catch {
    return "system";
  }
}

export function saveThemePreference(
  pref: ThemePreference,
  storage: Pick<Storage, "setItem" | "removeItem"> | undefined = safeStorage(),
): void {
  try {
    if (pref === "system") storage?.removeItem(THEME_STORAGE_KEY);
    else storage?.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    /* the preference still applies for this page view */
  }
}

export function applyTheme(
  pref: ThemePreference,
  root: HTMLElement = document.documentElement,
): void {
  if (pref === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", pref);
}

function safeStorage(): Storage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

/**
 * Inline script for <head>: sets `data-theme` before first paint so a saved choice never flashes the wrong theme.
 * Keep in sync with `readThemePreference` (a test runs both).
 */
export const themeInitScript = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;
