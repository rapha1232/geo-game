import { DEFAULT_LAYER, isLayerId, type LayerId } from "./layers";
import { parseFilter, serializeFilter, type Clause } from "./filter";

/** The shareable state of the page (atlas-explorer §8): `?layer=density&filter=population>1000000&sel=country:PER`. */
export type AtlasState = {
  layer: LayerId;
  filter: Clause[];
  /** The entity whose card is open. */
  sel: string | null;
  compare: string[];
  /** The globe (default), the flat map (full keyboard navigation) or the table. */
  view: "globe" | "map" | "table";
};

export const EMPTY_STATE: AtlasState = {
  layer: DEFAULT_LAYER,
  filter: [],
  sel: null,
  compare: [],
  view: "globe",
};

export function parseState(search: string, pathEntity?: string | null): AtlasState {
  const q = new URLSearchParams(search);
  const layer = q.get("layer") ?? "";
  const sel = pathEntity || q.get("sel");
  return {
    layer: isLayerId(layer) ? layer : DEFAULT_LAYER,
    filter: parseFilter(q.get("filter")),
    sel: sel && /^(country|territory):[A-Z]{3}$/.test(sel) ? sel : null,
    compare: (q.get("compare") ?? "")
      .split(",")
      .filter((x) => /^country:[A-Z]{3}$/.test(x))
      .slice(0, 3),
    view: q.get("view") === "table" ? "table" : q.get("view") === "map" ? "map" : "globe",
  };
}

export function stateToSearch(s: AtlasState): string {
  const q = new URLSearchParams();
  if (s.layer !== DEFAULT_LAYER) q.set("layer", s.layer);
  if (s.filter.length > 0) q.set("filter", serializeFilter(s.filter));
  if (s.sel) q.set("sel", s.sel);
  if (s.compare.length > 0) q.set("compare", s.compare.join(","));
  if (s.view !== "globe") q.set("view", s.view);
  const text = q.toString();
  return text ? `?${text}` : "";
}

/** The compare tray holds 3; a fourth replaces the oldest (atlas-explorer §5, AC-AE-004). */
export function addCompare(
  list: readonly string[],
  id: string,
): { list: string[]; replaced: string | null } {
  if (list.includes(id)) return { list: [...list], replaced: null };
  if (list.length < 3) return { list: [...list, id], replaced: null };
  return { list: [...list.slice(1), id], replaced: list[0] as string };
}
export const removeCompare = (list: readonly string[], id: string): string[] =>
  list.filter((x) => x !== id);
