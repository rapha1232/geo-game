import { z } from "zod";
import { haversineKm } from "@meridian/geo";
import type { AdjacencyEdge, Dispute, Entity } from "@meridian/schemas";
import { polygonAreaM2, refPoint, type PolygonCoords } from "./geometry.ts";
import { round6 } from "./util.ts";

/** Silhouette main-group radii (silhouette §5.4 rules 1 and 3). */
export const MAIN_RADIUS_KM = 1500;
export const ARCHIPELAGO_RADIUS_KM = 3000;

const polygonRef = (p: PolygonCoords): [number, number] =>
  refPoint({ type: "Polygon", coordinates: p });
const dist = (a: [number, number], b: [number, number]): number =>
  haversineKm({ lat: a[0], lon: a[1] }, { lat: b[0], lon: b[1] });

/** `content/overrides/silhouettes.yaml`: polygons near a point are moved to the remote parts, with a reason. */
export const silhouetteOverrides = z
  .object({
    overrides: z.array(
      z
        .object({
          entity: z.string().regex(/^country:[A-Z]{3}$/),
          reason: z.string().min(1),
          drop: z
            .array(
              z
                .object({
                  near: z.tuple([z.number(), z.number()]),
                  within_km: z.number().positive(),
                })
                .strict(),
            )
            .min(1),
        })
        .strict(),
    ),
  })
  .strict();
export type SilhouetteOverride = z.infer<typeof silhouetteOverrides>["overrides"][number];

export type RemotePart = { ref_point: [number, number]; area_km2: number };
export type SilhouetteParts = {
  main: PolygonCoords[];
  remote: PolygonCoords[];
  remoteParts: RemotePart[];
  archipelago: boolean;
};

/**
 * Splits an entity's polygons into the drawn main group and the remote parts (silhouette §5.4).
 * Main group: the largest polygon plus every polygon whose ref point is within 1,500 km of the largest one's
 * (3,000 km for archipelagic entities, where the largest polygon holds under half the area), minus any editorial drop.
 */
export function splitParts(
  polys: readonly PolygonCoords[],
  override?: SilhouetteOverride,
): SilhouetteParts {
  const areas = polys.map(polygonAreaM2);
  const total = areas.reduce((s, a) => s + a, 0);
  let big = 0;
  areas.forEach((a, i) => {
    if (a > (areas[big] as number)) big = i;
  });
  const archipelago = (areas[big] as number) < total * 0.5;
  const radius = archipelago ? ARCHIPELAGO_RADIUS_KM : MAIN_RADIUS_KM;
  const refs = polys.map(polygonRef);
  const main: PolygonCoords[] = [];
  const remote: PolygonCoords[] = [];
  const remoteParts: RemotePart[] = [];
  polys.forEach((p, i) => {
    const ref = refs[i] as [number, number];
    const dropped =
      i !== big && (override?.drop.some((d) => dist(ref, d.near) <= d.within_km) ?? false);
    if (i === big || (!dropped && dist(ref, refs[big] as [number, number]) <= radius)) main.push(p);
    else {
      remote.push(p);
      remoteParts.push({ ref_point: ref, area_km2: Math.round((areas[i] as number) / 1e4) / 100 });
    }
  });
  const order = remoteParts
    .map((_, i) => i)
    .sort(
      (a, b) => (remoteParts[b] as RemotePart).area_km2 - (remoteParts[a] as RemotePart).area_km2,
    );
  return {
    main,
    remote: order.map((i) => remote[i] as PolygonCoords),
    remoteParts: order.map((i) => remoteParts[i] as RemotePart),
    archipelago,
  };
}

/** Border contact found between two entities: which polygon of each touches. */
export type Contact = { a: string; b: string; polyA: Set<number>; polyB: Set<number> };

/**
 * Land borders from geometry. Two entities touch when at least two vertices of one lie within `tolDeg` of vertices
 * of the other (a shared border is drawn from the same line, so its vertices coincide; a strait is wider).
 */
export function findContacts(
  geoms: ReadonlyMap<string, readonly PolygonCoords[]>,
  tolDeg = 0.003,
): Contact[] {
  type Ref = { id: string; poly: number };
  const cell = (v: number): number => Math.floor(v / tolDeg);
  const grid = new Map<string, Ref[]>();
  const ids = [...geoms.keys()].sort();
  for (const id of ids)
    (geoms.get(id) as readonly PolygonCoords[]).forEach((poly, pi) => {
      const seen = new Set<string>();
      for (const ring of poly)
        for (const [x, y] of ring) {
          const key = `${cell(x)},${cell(y)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          (grid.get(key) ?? grid.set(key, []).get(key)!).push({ id, poly: pi });
        }
    });
  const hits = new Map<
    string,
    { a: string; b: string; pa: Set<number>; pb: Set<number>; n: number }
  >();
  for (const id of ids)
    (geoms.get(id) as readonly PolygonCoords[]).forEach((poly, pi) => {
      const counted = new Set<string>();
      for (const ring of poly)
        for (const [x, y] of ring) {
          const cx = cell(x);
          const cy = cell(y);
          for (let dx = -1; dx <= 1; dx++)
            for (let dy = -1; dy <= 1; dy++)
              for (const o of grid.get(`${cx + dx},${cy + dy}`) ?? []) {
                if (o.id <= id) continue;
                const key = `${id}|${o.id}`;
                const tag = `${key}|${pi}|${o.poly}|${cx}|${cy}`;
                if (counted.has(tag)) continue;
                counted.add(tag);
                const h =
                  hits.get(key) ??
                  hits.set(key, { a: id, b: o.id, pa: new Set(), pb: new Set(), n: 0 }).get(key)!;
                h.pa.add(pi);
                h.pb.add(o.poly);
                h.n++;
              }
        }
    });
  return [...hits.values()]
    .filter((h) => h.n >= 2)
    .sort((x, y) => `${x.a}${x.b}`.localeCompare(`${y.a}${y.b}`))
    .map((h) => ({ a: h.a, b: h.b, polyA: h.pa, polyB: h.pb }));
}

/** `content/overrides/adjacency.yaml`: names for borders reached only through an overseas part, and borders to drop. */
export const adjacencyOverrides = z
  .object({
    via: z.record(z.string(), z.string().min(1)).default({}),
    exclude: z
      .array(z.object({ edge: z.string(), reason: z.string().min(1) }).strict())
      .default([]),
    include: z
      .array(
        z
          .object({ edge: z.string(), reason: z.string().min(1), via: z.string().optional() })
          .strict(),
      )
      .default([]),
  })
  .strict();
export type AdjacencyOverrides = z.infer<typeof adjacencyOverrides>;

const edgeKey = (a: string, b: string): string => (a < b ? `${a}~${b}` : `${b}~${a}`);

/**
 * Edges for `core.adjacency` (DATA_MODEL §2.5). `via` names the overseas part when a border is reached only through
 * a polygon outside an entity's main group; `disputed` marks borders between two claimants of the same dispute.
 */
export function buildAdjacency(
  contacts: readonly Contact[],
  mainCount: ReadonlyMap<string, number>,
  overrides: AdjacencyOverrides,
  disputes: readonly Dispute[],
): AdjacencyEdge[] {
  const claimPairs = new Set<string>();
  for (const d of disputes) {
    const cs = d.claimants.filter((c) => c.startsWith("country:"));
    for (const x of cs) for (const y of cs) if (x < y) claimPairs.add(edgeKey(x, y));
  }
  const excluded = new Set(overrides.exclude.map((e) => e.edge));
  const edges = new Map<string, AdjacencyEdge>();
  const add = (a: string, b: string, via?: string): void => {
    const k = edgeKey(a, b);
    const [lo, hi] = k.split("~") as [string, string];
    edges.set(k, {
      a: lo as AdjacencyEdge["a"],
      b: hi as AdjacencyEdge["b"],
      ...(claimPairs.has(k) ? { disputed: true } : {}),
      ...(via ? { via } : {}),
    });
  };
  const outside = (set: Set<number>, n: number): boolean => ![...set].some((i) => i < n);
  for (const c of contacts) {
    const k = edgeKey(c.a, c.b);
    if (excluded.has(k)) continue;
    // Polygons are listed main group first, so a contact only through an index past the main group is overseas.
    const overseas =
      outside(c.polyA, mainCount.get(c.a) ?? Infinity) ||
      outside(c.polyB, mainCount.get(c.b) ?? Infinity);
    const via = overrides.via[k];
    if (overseas && !via)
      throw new Error(
        `${k}: the border is only through an overseas part; add a name to via in content/overrides/adjacency.yaml`,
      );
    add(c.a, c.b, overseas ? via : undefined);
  }
  for (const inc of overrides.include) {
    const [a, b] = inc.edge.split("~") as [string, string];
    add(a, b, inc.via);
  }
  return [...edges.values()].sort((x, y) => `${x.a}${x.b}`.localeCompare(`${y.a}${y.b}`));
}

/** Percentile rank in [0, 1]: ties share the mean rank. */
function percentiles(values: readonly number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const n = values.length;
  return values.map((v) => {
    const first = sorted.indexOf(v);
    const last = sorted.lastIndexOf(v);
    return n > 1 ? (first + last) / 2 / (n - 1) : 0.5;
  });
}
const r3 = (n: number): number => round6(Math.round(n * 1000) / 1000);
const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/**
 * Difficulty priors (DATA_AND_CONTENT §9), all in [0, 1], higher = harder. Until the Wikimedia pageview snapshot is in
 * the pipeline, `fam` is the percentile of log10(population) alone, and `capFam` equals `fam` (see §9 for the deviation).
 */
export function difficultyPriors(
  entities: readonly Entity[],
): Map<string, NonNullable<Entity["difficulty"]>> {
  const fam = percentiles(entities.map((e) => Math.log10(Math.max(1, e.population?.value ?? 1))));
  const areaN = percentiles(
    entities.map((e) => Math.log10(Math.max(0.01, e.area_km2?.value ?? 0.01))),
  );
  const out = new Map<string, NonNullable<Entity["difficulty"]>>();
  entities.forEach((e, i) => {
    const f = fam[i] as number;
    const a = areaN[i] as number;
    out.set(e.id, {
      recall: r3(clamp01(1 - f)),
      locate: r3(clamp01(1 - (0.6 * f + 0.4 * a))),
      flag: r3(clamp01(1 - f)),
      capital: r3(clamp01(1 - f)),
      shape: r3(clamp01(1 - (0.5 * f + 0.3 * a + 0.2 * 0.5))),
    });
  });
  return out;
}
