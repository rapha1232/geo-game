/**
 * Map style: how every GameMap draws sea, land and borders (UX_AND_DESIGN §5.3).
 * Saved on the device like the theme and applied as `data-map-style` on <html> before first paint,
 * so all maps on a page switch together and a saved choice never flashes.
 */
export type MapStyle = "atlas" | "political" | "midnight" | "ink" | "blueprint";

export const MAP_STYLE_STORAGE_KEY = "meridian:map-style";
export const MAP_STYLES: readonly MapStyle[] = [
  "atlas",
  "political",
  "midnight",
  "ink",
  "blueprint",
];
export const DEFAULT_MAP_STYLE: MapStyle = "atlas";
/** Fired on window when the style changes in this tab, so open pickers stay in sync. */
export const MAP_STYLE_EVENT = "meridian:map-style";

export const isMapStyle = (v: unknown): v is MapStyle => MAP_STYLES.includes(v as MapStyle);

function safeStorage(): Storage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

export function readMapStyle(
  storage: Pick<Storage, "getItem"> | undefined = safeStorage(),
): MapStyle {
  try {
    const v = storage?.getItem(MAP_STYLE_STORAGE_KEY);
    return isMapStyle(v) ? v : DEFAULT_MAP_STYLE;
  } catch {
    return DEFAULT_MAP_STYLE;
  }
}

export function applyMapStyle(
  style: MapStyle,
  root: HTMLElement | undefined = typeof document === "undefined"
    ? undefined
    : document.documentElement,
): void {
  if (!root) return;
  if (style === DEFAULT_MAP_STYLE) root.removeAttribute("data-map-style");
  else root.setAttribute("data-map-style", style);
}

/** Saves, applies and announces the choice. Storage failures only lose persistence. */
export function setMapStyle(
  style: MapStyle,
  storage: Pick<Storage, "setItem" | "removeItem"> | undefined = safeStorage(),
): void {
  try {
    if (style === DEFAULT_MAP_STYLE) storage?.removeItem(MAP_STYLE_STORAGE_KEY);
    else storage?.setItem(MAP_STYLE_STORAGE_KEY, style);
  } catch {
    /* applies for this page view */
  }
  applyMapStyle(style);
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(MAP_STYLE_EVENT));
}

/** Inline <head> script, run next to the theme script. Keep in sync with `readMapStyle` (a test runs both). */
export const mapStyleInitScript = `(function(){try{var s=localStorage.getItem(${JSON.stringify(MAP_STYLE_STORAGE_KEY)});if(${JSON.stringify(MAP_STYLES.filter((s) => s !== DEFAULT_MAP_STYLE))}.indexOf(s)>-1)document.documentElement.setAttribute("data-map-style",s)}catch(e){}})()`;

/** Swatch colours for pickers: sea, land, border, accent line. Mirrors GameMap.module.css. */
export const MAP_STYLE_SWATCH: Record<MapStyle, [string, string, string, string]> = {
  atlas: ["#bcd9e4", "#f1ead9", "#9a8f7c", "#7fb2c6"],
  political: ["#cfe6f2", "#f4c9a8", "#ffffff", "#b9dca6"],
  midnight: ["#0b1524", "#1d2a3c", "#3b5370", "#5ee0f0"],
  ink: ["#f4f4f2", "#d9d9d6", "#ffffff", "#1a2433"],
  blueprint: ["#1f4f86", "#2b65a5", "#e6f1ff", "#9cc4f0"],
};

/** A stable colour slot 0–5 per country, so neighbours never share one (greedy colouring over adjacency). */
export function colourSlots(
  ids: readonly string[],
  adjacency: readonly (readonly number[])[],
  slots = 6,
): Map<string, number> {
  const order = ids
    .map((id, i) => ({ id, i }))
    .sort(
      (a, b) =>
        (adjacency[b.i]?.length ?? 0) - (adjacency[a.i]?.length ?? 0) || (a.id < b.id ? -1 : 1),
    );
  const out = new Map<string, number>();
  const byIndex = new Map<number, number>();
  for (const { id, i } of order) {
    const used = new Set((adjacency[i] ?? []).map((j) => byIndex.get(j)));
    let pick = 0;
    // Start at a hash-based slot so colours spread evenly instead of piling into slot 0.
    const start = [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % slots;
    for (let k = 0; k < slots; k++) {
      const c = (start + k) % slots;
      if (!used.has(c)) {
        pick = c;
        break;
      }
    }
    byIndex.set(i, pick);
    out.set(id, pick);
  }
  return out;
}
