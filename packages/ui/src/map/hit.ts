/** Hit testing for tiny targets (quiz-library §5.4). Coordinates are screen pixels. */
export type PointerKind = "fine" | "coarse";

/** A feature whose longest on-screen side is below `threshold` gets a hit ring of radius `radius`. */
export const TINY: Record<PointerKind, { threshold: number; radius: number }> = {
  fine: { threshold: 14, radius: 10 },
  coarse: { threshold: 24, radius: 16 },
};

export type Measured = {
  id: string;
  /** longest side of the on-screen bounding box */ sizePx: number;
  cx: number;
  cy: number;
};
export type Ring = { id: string; cx: number; cy: number; r: number };

/** Rings for every feature that is too small to hit reliably. Recomputed whenever the zoom changes. */
export function tinyRings(features: readonly Measured[], pointer: PointerKind): Ring[] {
  const { threshold, radius } = TINY[pointer];
  return features
    .filter((f) => f.sizePx < threshold)
    .map((f) => ({ id: f.id, cx: f.cx, cy: f.cy, r: radius }));
}

/** Rings first: the closest centre within its radius wins. Returns null when the point is in no ring. */
export function ringAt(rings: readonly Ring[], x: number, y: number): Ring | null {
  let best: Ring | null = null;
  let bestD = Infinity;
  for (const r of rings) {
    const d = Math.hypot(x - r.cx, y - r.cy);
    if (d <= r.r && d < bestD) {
      best = r;
      bestD = d;
    }
  }
  return best;
}

/** On touch, a tap this close to a border or a second ring asks for confirmation in a loupe. */
export const LOUPE_RADIUS_PX = 8;
export const LOUPE_ZOOM = 3;

/**
 * Candidates near a tap: every ring containing it plus every feature found by sampling `polygonAt` around it.
 * More than one distinct candidate means the tap is ambiguous and the loupe should open.
 */
export function candidatesNear(
  rings: readonly Ring[],
  x: number,
  y: number,
  polygonAt: (x: number, y: number) => string | null,
  radius = LOUPE_RADIUS_PX,
): string[] {
  const ids = new Set<string>();
  for (const r of rings) if (Math.hypot(x - r.cx, y - r.cy) <= r.r + radius) ids.add(r.id);
  const samples: [number, number][] = [[x, y]];
  for (let i = 0; i < 8; i++)
    samples.push([
      x + radius * Math.cos((i * Math.PI) / 4),
      y + radius * Math.sin((i * Math.PI) / 4),
    ]);
  for (const [sx, sy] of samples) {
    const id = polygonAt(sx, sy);
    if (id) ids.add(id);
  }
  return [...ids].sort();
}
