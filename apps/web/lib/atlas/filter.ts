import { isLayerId, layerById, type LayerId } from "./layers";

export type Op = ">" | "<" | ">=" | "<=" | "=";
export type Clause = { layer: Exclude<LayerId, "political">; op: Op; value: number | boolean };

export const MAX_CLAUSES = 3;
const OPS: readonly Op[] = [">=", "<=", ">", "<", "="];

/**
 * "Show only where…" (atlas-explorer §5): up to 3 clauses joined with AND. Serialised as `population>100000000` for the
 * URL, several clauses joined by commas.
 */
export function parseFilter(text: string | null | undefined): Clause[] {
  if (!text) return [];
  const out: Clause[] = [];
  for (const part of text.split(",").slice(0, MAX_CLAUSES)) {
    const op = OPS.find((o) => part.includes(o));
    if (!op) continue;
    const [layer, raw] = part.split(op) as [string, string];
    if (!isLayerId(layer) || layer === "political") continue;
    if (layerById(layer)?.kind === "category") {
      if (op === "=" && (raw === "true" || raw === "false"))
        out.push({ layer: layer as Clause["layer"], op, value: raw === "true" });
      continue;
    }
    const value = Number(raw);
    if (raw.trim() !== "" && Number.isFinite(value))
      out.push({ layer: layer as Clause["layer"], op, value });
  }
  return out;
}

export const serializeFilter = (clauses: readonly Clause[]): string =>
  clauses.map((c) => `${c.layer}${c.op}${c.value}`).join(",");

export type Lookup = {
  /** The value of an indicator layer for a place, or undefined when there is no data. */
  indicator(layer: string, id: string): number | undefined;
  landlocked(id: string): boolean | undefined;
};

/** Whether a place satisfies every clause. A place with no data for a clause never matches it. */
export function matches(c: readonly Clause[], id: string, lookup: Lookup): boolean {
  return c.every((cl) => {
    if (typeof cl.value === "boolean") return lookup.landlocked(id) === cl.value;
    const v = lookup.indicator(cl.layer, id);
    if (v === undefined) return false;
    switch (cl.op) {
      case ">":
        return v > cl.value;
      case "<":
        return v < cl.value;
      case ">=":
        return v >= cl.value;
      case "<=":
        return v <= cl.value;
      case "=":
        return v === cl.value;
    }
  });
}

export const matching = (c: readonly Clause[], ids: readonly string[], lookup: Lookup): string[] =>
  c.length === 0 ? [...ids] : ids.filter((id) => matches(c, id, lookup));
