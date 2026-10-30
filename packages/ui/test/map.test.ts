import { describe, expect, it } from "vitest";
import { geoPath } from "d3-geo";
import { NavIndex, type NavPoint } from "../src/map/keynav";
import { LOUPE_RADIUS_PX, TINY, candidatesNear, ringAt, tinyRings } from "../src/map/hit";
import { worldProjection } from "../src/map/projection";
import {
  DRAG_THRESHOLD_PX,
  IDENTITY,
  MAX_ZOOM,
  MIN_ZOOM,
  baseToScreen,
  clampTransform,
  isDrag,
  lodForZoom,
  pickLod,
  screenToBase,
  zoomAt,
} from "../src/map/view";

describe("view: zoom, pan and level of detail", () => {
  it("picks the level of detail from the zoom (110m < 3×, 50m from 3×, 10m from 7×)", () => {
    expect([1, 2.99].map(lodForZoom)).toEqual(["110m", "110m"]);
    expect([3, 6.99].map(lodForZoom)).toEqual(["50m", "50m"]);
    expect([7, 12].map(lodForZoom)).toEqual(["10m", "10m"]);
  });

  it("falls back to the finest pack that is loaded when the wanted one is not", () => {
    expect(pickLod("10m", ["110m", "50m"])).toBe("50m");
    expect(pickLod("50m", ["110m"])).toBe("110m");
    expect(pickLod("110m", ["50m"])).toBe("50m"); // nothing coarser: use what exists
    expect(pickLod("50m", [])).toBeNull();
  });

  it("clamps zoom to 1–12 and keeps the map covering the viewport", () => {
    const w = 400;
    const h = 300;
    expect(clampTransform({ k: 99, x: 0, y: 0 }, w, h).k).toBe(MAX_ZOOM);
    expect(clampTransform({ k: 0.1, x: 0, y: 0 }, w, h).k).toBe(MIN_ZOOM);
    const t = clampTransform({ k: 2, x: 500, y: 500 }, w, h);
    expect([t.x, t.y]).toEqual([0, 0]); // cannot pan past the top-left edge
    const u = clampTransform({ k: 2, x: -9999, y: -9999 }, w, h);
    expect([u.x, u.y]).toEqual([w - w * 2, h - h * 2]); // nor past the bottom-right edge
  });

  it("zooming keeps the point under the cursor where it was", () => {
    const w = 800;
    const h = 600;
    const start = zoomAt(IDENTITY, 2, 400, 300, w, h);
    const [bx, by] = screenToBase(start, 600, 200);
    const next = zoomAt(start, 1.5, 600, 200, w, h);
    const [sx, sy] = baseToScreen(next, bx, by);
    expect(sx).toBeCloseTo(600, 6);
    expect(sy).toBeCloseTo(200, 6);
  });

  it("screen and base coordinates are inverses", () => {
    const t = { k: 3.5, x: -120, y: -40 };
    const [bx, by] = screenToBase(t, 321, 123);
    expect(baseToScreen(t, bx, by)).toEqual([321, 123].map((v) => expect.closeTo(v, 8)));
  });

  it("a drag of more than 6 px is a pan, never a click", () => {
    expect(DRAG_THRESHOLD_PX).toBe(6);
    expect(isDrag(3, 4)).toBe(false); // exactly 5
    expect(isDrag(6, 0)).toBe(false);
    expect(isDrag(6, 1)).toBe(true);
  });
});

describe("tiny-target rings (quiz-library §5.4)", () => {
  const f = (id: string, sizePx: number, cx = 100, cy = 100) => ({ id, sizePx, cx, cy });

  it("fine pointers ring features under 14 px with a 10 px radius, coarse under 24 px with 16 px", () => {
    expect(TINY).toEqual({
      fine: { threshold: 14, radius: 10 },
      coarse: { threshold: 24, radius: 16 },
    });
    expect(tinyRings([f("a", 13.9), f("b", 14)], "fine")).toEqual([
      { id: "a", cx: 100, cy: 100, r: 10 },
    ]);
    expect(tinyRings([f("a", 23.9), f("b", 24)], "coarse")).toEqual([
      { id: "a", cx: 100, cy: 100, r: 16 },
    ]);
    expect(tinyRings([f("a", 20)], "fine")).toEqual([]);
  });

  it("the closest ring centre inside its radius wins, and outside every ring there is no hit", () => {
    const rings = [
      { id: "near", cx: 100, cy: 100, r: 16 },
      { id: "far", cx: 108, cy: 100, r: 16 },
    ];
    expect(ringAt(rings, 103, 100)?.id).toBe("near");
    expect(ringAt(rings, 106, 100)?.id).toBe("far");
    expect(ringAt(rings, 100 - 16, 100)?.id).toBe("near"); // the edge counts (only this ring reaches it)
    expect(ringAt(rings, 200, 200)).toBeNull();
    expect(ringAt([], 1, 1)).toBeNull();
  });

  it("AC-QZ-011: on a 390×844 touch viewport, a tap within 16 px of Tuvalu's label point selects Tuvalu", () => {
    const projection = worldProjection(390, 844);
    const [cx, cy] = projection([179.2, -8.5]) as [number, number]; // Tuvalu's label point, [lon, lat]
    const tuvalu = { id: "country:TUV", sizePx: 1.5, cx, cy };
    const rings = tinyRings(
      [tuvalu, { id: "country:BRA", sizePx: 120, cx: 100, cy: 200 }],
      "coarse",
    );
    expect(rings.map((r) => r.id)).toEqual(["country:TUV"]);
    for (const [dx, dy] of [
      [0, 0],
      [10, 10],
      [-11, 11],
      [16, 0],
      [0, -16],
    ] as const) {
      expect(ringAt(rings, cx + dx, cy + dy)?.id, `${dx},${dy}`).toBe("country:TUV");
    }
    expect(ringAt(rings, cx + 12, cy + 12)).toBeNull(); // 16.97 px away: outside
    expect(ringAt(rings, cx + 17, cy)).toBeNull();
  });

  it("candidatesNear finds every ring and polygon within the loupe radius, so ambiguous taps are detected", () => {
    const rings = [
      { id: "a", cx: 100, cy: 100, r: 10 },
      { id: "b", cx: 112, cy: 100, r: 10 },
    ];
    const noPolys = () => null;
    expect(candidatesNear(rings, 106, 100, noPolys)).toEqual(["a", "b"]);
    expect(candidatesNear(rings, 40, 40, noPolys)).toEqual([]);
    const border = (x: number) => (x < 50 ? "west" : "east"); // a vertical border at x = 50
    expect(candidatesNear([], 46, 10, (x) => border(x))).toEqual(["east", "west"]);
    expect(candidatesNear([], 20, 10, (x) => border(x))).toEqual(["west"]);
    expect(LOUPE_RADIUS_PX).toBe(8);
  });
});

describe("keyboard spatial navigation", () => {
  const grid: NavPoint[] = [
    { id: "c", x: 100, y: 100 },
    { id: "e", x: 160, y: 100 },
    { id: "w", x: 40, y: 100 },
    { id: "n", x: 100, y: 40 },
    { id: "s", x: 100, y: 160 },
    { id: "far-e", x: 400, y: 100 },
    { id: "ne", x: 140, y: 60 },
  ];
  const nav = new NavIndex(grid);

  it("moves to the nearest feature in the direction of the arrow", () => {
    const cross = new NavIndex(grid.filter((p) => p.id !== "ne"));
    expect(cross.next("c", "right")).toBe("e");
    expect(cross.next("c", "left")).toBe("w");
    expect(cross.next("c", "up")).toBe("n");
    expect(cross.next("c", "down")).toBe("s");
  });

  it("only considers features within ±60° of the direction", () => {
    // "ne" is 45° up-right: it qualifies for both right and up, and is nearer than the straight-ahead ones.
    expect(nav.next("c", "right")).toBe("ne");
  });

  it("returns null when nothing lies in that direction, and never returns the current feature", () => {
    expect(nav.next("far-e", "right")).toBeNull();
    for (const d of ["up", "down", "left", "right"] as const)
      expect(nav.next("c", d)).not.toBe("c");
    expect(nav.next("unknown", "up")).toBeNull();
  });

  it("handles empty and single-feature maps", () => {
    expect(new NavIndex([]).next("x", "up")).toBeNull();
    expect(new NavIndex([{ id: "only", x: 1, y: 1 }]).next("only", "left")).toBeNull();
    expect(new NavIndex([]).nearest(0, 0)).toBeNull();
  });

  it("nearest() starts navigation at the feature closest to a point", () => {
    expect(nav.nearest(150, 105)).toBe("e");
  });

  it("is deterministic and fast on thousands of points", () => {
    const many = Array.from({ length: 5000 }, (_, i) => ({
      id: `p${i}`,
      x: (i * 7919) % 1000,
      y: (i * 104729) % 1000,
    }));
    const big = new NavIndex(many);
    const t0 = performance.now();
    const results = Array.from({ length: 200 }, (_, i) =>
      big.next(`p${i}`, (["up", "down", "left", "right"] as const)[i % 4] as "up"),
    );
    expect((performance.now() - t0) / 200).toBeLessThan(5);
    expect(results).toEqual(
      Array.from({ length: 200 }, (_, i) =>
        big.next(`p${i}`, (["up", "down", "left", "right"] as const)[i % 4] as "up"),
      ),
    );
  });
});

describe("projection", () => {
  it("Equal Earth fits the world inside the viewport with a margin", () => {
    const p = worldProjection(800, 600);
    const path = geoPath(p);
    const [[x0, y0], [x1, y1]] = path.bounds({ type: "Sphere" });
    expect(x0).toBeGreaterThanOrEqual(4 - 1e-6);
    expect(x1).toBeLessThanOrEqual(796 + 1e-6);
    expect(y0).toBeGreaterThanOrEqual(4 - 1e-6);
    expect(y1).toBeLessThanOrEqual(596 + 1e-6);
  });
  it("is equal-area: Greenland is far smaller than Africa, unlike Mercator", () => {
    const area = geoPath(worldProjection(1000, 600)).area;
    const box = (w: number, s: number, e: number, n: number) => ({
      type: "Polygon" as const,
      coordinates: [
        [
          [w, s],
          [w, n],
          [e, n],
          [e, s],
          [w, s],
        ],
      ],
    });
    const equatorial = area(box(0, -10, 20, 10));
    const polar = area(box(0, 60, 20, 80));
    // Equal-area projections keep true proportions: 20°×20° at the equator is ~2.9× a same-sized box at 60–80°N.
    expect(equatorial / polar).toBeGreaterThan(2.2);
    expect(equatorial / polar).toBeLessThan(4);
  });
});
