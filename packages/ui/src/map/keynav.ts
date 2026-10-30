import Flatbush from "flatbush";

/** Spatial keyboard navigation (ARCHITECTURE §6.3): arrow keys move to the nearest feature in that direction. */
export type NavPoint = { id: string; x: number; y: number };
export type Direction = "up" | "down" | "left" | "right";

/** Screen angle of each key, in radians (y grows downward). */
const ANGLE: Record<Direction, number> = {
  right: 0,
  down: Math.PI / 2,
  left: Math.PI,
  up: -Math.PI / 2,
};
export const CONE = (60 * Math.PI) / 180;

const angleDiff = (a: number, b: number): number => {
  const d = Math.abs(a - b) % (2 * Math.PI);
  return d > Math.PI ? 2 * Math.PI - d : d;
};

export class NavIndex {
  private readonly index: Flatbush;
  private readonly byIdx: NavPoint[];
  private readonly byId = new Map<string, NavPoint>();

  constructor(points: readonly NavPoint[]) {
    this.byIdx = [...points];
    this.index = new Flatbush(Math.max(1, this.byIdx.length));
    for (const p of this.byIdx) {
      this.index.add(p.x, p.y, p.x, p.y);
      this.byId.set(p.id, p);
    }
    if (this.byIdx.length === 0) this.index.add(0, 0, 0, 0);
    this.index.finish();
  }

  get size(): number {
    return this.byIdx.length;
  }

  /** The nearest other feature whose bearing is within ±60° of the key's direction, or null. */
  next(fromId: string, dir: Direction): string | null {
    const from = this.byId.get(fromId);
    if (!from || this.byIdx.length < 2) return null;
    const want = ANGLE[dir];
    const hits = this.index.neighbors(from.x, from.y, 1, Infinity, (i) => {
      const p = this.byIdx[i] as NavPoint;
      if (p.id === fromId) return false;
      return angleDiff(Math.atan2(p.y - from.y, p.x - from.x), want) <= CONE;
    });
    const hit = hits[0];
    return hit === undefined ? null : (this.byIdx[hit] as NavPoint).id;
  }

  /** The feature nearest to a screen point, used to start navigation at a sensible place. */
  nearest(x: number, y: number): string | null {
    if (this.byIdx.length === 0) return null;
    const hit = this.index.neighbors(x, y, 1)[0];
    return hit === undefined ? null : (this.byIdx[hit] as NavPoint).id;
  }
}
