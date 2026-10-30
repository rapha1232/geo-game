import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import { pointInPolygon, distanceToAreaKm, type MultiPolygon } from "@meridian/geo";
import {
  largestPolygon,
  signedArea,
  type Geometry,
  type Position,
  type PolygonCoords,
  type Ring,
} from "../geometry.ts";
import type { CapitalPoint, ContentSet, GeometryByScale, Issue, Scale } from "./types.ts";

const SCALES: Scale[] = ["110m", "50m", "10m"];

/** Decodes a geometry pack (TopoJSON) into polygons by entity id. */
export function decodePack(topology: unknown): Map<string, PolygonCoords[]> {
  const topo = topology as Topology;
  const object = topo.objects["countries"] as GeometryCollection | undefined;
  const out = new Map<string, PolygonCoords[]>();
  if (!object) return out;
  const fc = feature(topo, object) as unknown as {
    features: { id?: string | number; geometry: unknown }[];
  };
  for (const f of fc.features) {
    const id = String(f.id);
    const g = f.geometry as Geometry | null;
    if (!g) {
      out.set(id, []);
      continue;
    }
    out.set(id, g.type === "Polygon" ? [g.coordinates] : g.coordinates);
  }
  return out;
}

const orient = (a: Position, b: Position, c: Position): number =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

/**
 * Does the ring cross itself? Strict crossings only (touching at a vertex is allowed).
 * A uniform grid keeps this near-linear for rings with tens of thousands of points.
 */
export function ringSelfIntersects(ring: Ring): boolean {
  const n = ring.length - 1; // segments: ring[i] → ring[i+1]
  if (n < 4) return false;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of ring) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const cells = Math.max(1, Math.ceil(Math.sqrt(n)));
  const sx = (maxX - minX || 1) / cells;
  const sy = (maxY - minY || 1) / cells;
  const grid = new Map<number, number[]>();
  const clamp = (v: number): number => Math.min(cells - 1, Math.max(0, v));
  for (let i = 0; i < n; i++) {
    const a = ring[i] as Position;
    const b = ring[i + 1] as Position;
    const x0 = clamp(Math.floor((Math.min(a[0], b[0]) - minX) / sx));
    const x1 = clamp(Math.floor((Math.max(a[0], b[0]) - minX) / sx));
    const y0 = clamp(Math.floor((Math.min(a[1], b[1]) - minY) / sy));
    const y1 = clamp(Math.floor((Math.max(a[1], b[1]) - minY) / sy));
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const key = cy * cells + cx;
        const list = grid.get(key);
        if (list) list.push(i);
        else grid.set(key, [i]);
      }
    }
  }
  const tested = new Set<number>();
  for (const list of grid.values()) {
    for (let p = 0; p < list.length; p++) {
      for (let q = p + 1; q < list.length; q++) {
        const i = list[p] as number;
        const j = list[q] as number;
        if (j - i <= 1 || (i === 0 && j === n - 1)) continue; // neighbours share an endpoint
        const key = i * n + j;
        if (tested.has(key)) continue;
        tested.add(key);
        const a = ring[i] as Position;
        const b = ring[i + 1] as Position;
        const c = ring[j] as Position;
        const d = ring[j + 1] as Position;
        if (orient(c, d, a) * orient(c, d, b) < 0 && orient(a, b, c) * orient(a, b, d) < 0)
          return true;
      }
    }
  }
  return false;
}

const finite = (p: Position): boolean =>
  Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90;

/** Problems with one polygon: shape, closure, winding, self-crossing. */
export function polygonProblems(poly: PolygonCoords): string[] {
  const out: string[] = [];
  if (poly.length === 0) return ["has no rings"];
  poly.forEach((ring, r) => {
    const where = r === 0 ? "exterior ring" : `hole ${r}`;
    if (ring.length < 4) return void out.push(`${where} has fewer than 4 positions`);
    const first = ring[0] as Position;
    const last = ring[ring.length - 1] as Position;
    if (first[0] !== last[0] || first[1] !== last[1]) out.push(`${where} is not closed`);
    if (!ring.every(finite)) return void out.push(`${where} has an invalid coordinate`);
    const area = signedArea(ring);
    if (area === 0) out.push(`${where} has zero area`);
    else if (area < 0 !== (r === 0))
      out.push(`${where} is wound the wrong way (exteriors clockwise, holes counter-clockwise)`);
    if (ringSelfIntersects(ring)) out.push(`${where} crosses itself`);
  });
  return out;
}

/** GEOM_INVALID and GEOM_MISSING over every decoded scale. */
export function geometryRules(c: ContentSet): Issue[] {
  const geometry = c.geometry as GeometryByScale | undefined;
  if (!geometry) return [];
  const issues: Issue[] = [];
  const playable = c.entities.filter((e) => (e.sets?.length ?? 0) > 0);
  for (const scale of SCALES) {
    const byId = geometry[scale];
    for (const e of playable) {
      const polys = byId.get(e.id);
      if (!polys || polys.length === 0)
        issues.push({
          code: "GEOM_MISSING",
          level: "error",
          ref: e.id,
          message: `${e.id} has no geometry at ${scale}`,
        });
    }
    for (const [id, polys] of byId) {
      if (polys.length === 0) {
        issues.push({
          code: "GEOM_INVALID",
          level: "error",
          ref: id,
          message: `${id} has an empty geometry at ${scale}`,
        });
        continue;
      }
      polys.forEach((poly, i) => {
        for (const problem of polygonProblems(poly)) {
          const known = c.knownGeometryIssues?.find(
            (k) => k.entity === id && k.scale === scale && problem.includes(k.problem),
          );
          issues.push({
            code: "GEOM_INVALID",
            level: known ? "warn" : "error",
            ref: id,
            message: `${id} at ${scale}, polygon ${i}: ${problem}${known ? ` (known upstream defect: ${known.reason})` : ""}`,
          });
        }
      });
    }
  }
  return issues;
}

/** REF_POINT_OUTSIDE: the reference point lies inside the largest 1:10m polygon. */
export function refPointRules(c: ContentSet): Issue[] {
  const tenM = c.geometry?.["10m"];
  if (!tenM) return [];
  const issues: Issue[] = [];
  for (const e of c.entities) {
    if (!e.ref_point) continue;
    const polys = tenM.get(e.id);
    if (!polys || polys.length === 0) continue; // reported by GEOM_MISSING
    const largest = largestPolygon({ type: "MultiPolygon", coordinates: polys });
    const [lat, lon] = e.ref_point;
    if (!pointInPolygon({ lat, lon }, largest))
      issues.push({
        code: "REF_POINT_OUTSIDE",
        level: "error",
        ref: e.id,
        message: `${e.id}: ref_point [${lat}, ${lon}] is outside its largest 1:10m polygon`,
      });
  }
  return issues;
}

/** CAPITAL_OUTSIDE: a capital's point lies inside its country's 1:10m polygon, within 2 km. */
export function capitalRules(c: ContentSet): Issue[] {
  const tenM = c.geometry?.["10m"];
  if (!tenM || !c.capitals) return [];
  const issues: Issue[] = [];
  for (const cap of c.capitals as readonly CapitalPoint[]) {
    const polys = tenM.get(cap.entityId);
    if (!polys || polys.length === 0) {
      issues.push({
        code: "CAPITAL_OUTSIDE",
        level: "error",
        ref: cap.entityId,
        message: `${cap.name}: ${cap.entityId} has no 1:10m geometry to check against`,
      });
      continue;
    }
    const km = distanceToAreaKm({ lat: cap.lat, lon: cap.lon }, polys as unknown as MultiPolygon);
    if (km > 2)
      issues.push({
        code: "CAPITAL_OUTSIDE",
        level: "error",
        ref: cap.entityId,
        message: `${cap.name} is ${km.toFixed(1)} km outside ${cap.entityId} (tolerance 2 km)`,
      });
  }
  return issues;
}
