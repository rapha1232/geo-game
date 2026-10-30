/** Zoom and pan maths for GameMap. Pure, so it is testable without a DOM. */
export type Transform = { k: number; x: number; y: number };
export type Lod = "110m" | "50m" | "10m";

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 12;
export const IDENTITY: Transform = { k: 1, x: 0, y: 0 };

/** Level of detail by zoom (ARCHITECTURE §6.1): 110m below 3×, 50m from 3×, 10m from 7×. */
export function lodForZoom(k: number): Lod {
  if (k >= 7) return "10m";
  if (k >= 3) return "50m";
  return "110m";
}

/** Use the finest available pack that is not finer than wanted, falling back to coarser ones. */
export function pickLod(wanted: Lod, available: readonly Lod[]): Lod | null {
  const order: Lod[] = ["10m", "50m", "110m"];
  for (const l of order.slice(order.indexOf(wanted))) if (available.includes(l)) return l;
  for (const l of [...order].reverse()) if (available.includes(l)) return l;
  return null;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Keeps the map covering the viewport: panning can never reveal empty space beyond the world's edge. */
export function clampTransform(t: Transform, width: number, height: number): Transform {
  const k = clamp(t.k, MIN_ZOOM, MAX_ZOOM);
  return { k, x: clamp(t.x, width - width * k, 0), y: clamp(t.y, height - height * k, 0) };
}

/** Zoom by `factor` keeping the point (cx, cy) fixed on screen. */
export function zoomAt(
  t: Transform,
  factor: number,
  cx: number,
  cy: number,
  width: number,
  height: number,
): Transform {
  const k = clamp(t.k * factor, MIN_ZOOM, MAX_ZOOM);
  const f = k / t.k;
  return clampTransform({ k, x: cx - (cx - t.x) * f, y: cy - (cy - t.y) * f }, width, height);
}

export const screenToBase = (t: Transform, sx: number, sy: number): [number, number] => [
  (sx - t.x) / t.k,
  (sy - t.y) / t.k,
];
export const baseToScreen = (t: Transform, bx: number, by: number): [number, number] => [
  bx * t.k + t.x,
  by * t.k + t.y,
];

/** A drag of more than 6 px is a pan, never a click (quiz-library §5.4). */
export const DRAG_THRESHOLD_PX = 6;
export const isDrag = (dx: number, dy: number): boolean => Math.hypot(dx, dy) > DRAG_THRESHOLD_PX;
