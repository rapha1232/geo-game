import { describe, expect, it } from "vitest";
import {
  boundingBox,
  largestPolygon,
  normalizeGeometry,
  pointInsideLargest,
  refPoint,
  signedArea,
  type Geometry,
  type Ring,
} from "../src/geometry.ts";
import { round6, sha256, stableStringify } from "../src/util.ts";

const square = (x: number, y: number, s: number): Ring => [
  [x, y],
  [x + s, y],
  [x + s, y + s],
  [x, y + s],
  [x, y],
];
const cw = (r: Ring) => signedArea(r) < 0;

describe("util", () => {
  it("stableStringify sorts keys and drops undefined, whatever the insertion order", () => {
    expect(stableStringify({ b: 1, a: { d: [3, { y: 1, x: 2 }], c: undefined } })).toBe(
      '{"a":{"d":[3,{"x":2,"y":1}]},"b":1}',
    );
    expect(stableStringify({ a: 1, b: 2 })).toBe(stableStringify({ b: 2, a: 1 }));
    expect(() => stableStringify({ a: NaN })).toThrow();
  });
  it("round6 rounds to 6 decimals and never returns -0", () => {
    expect(round6(1.23456789)).toBe(1.234568);
    expect(Object.is(round6(-1e-9), 0)).toBe(true);
  });
  it("sha256 matches the known vector", () => {
    expect(sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("normalizeGeometry (pack winding: exterior clockwise, holes counter-clockwise)", () => {
  it("reverses wrongly wound rings, keeps right ones, and closes open rings", () => {
    const ccwOuter = square(0, 0, 10);
    const cwOuter = [...ccwOuter].reverse();
    expect(cw(ccwOuter)).toBe(false);
    for (const outer of [ccwOuter, cwOuter]) {
      const g = normalizeGeometry({
        type: "Polygon",
        coordinates: [
          outer,
          cwOuter.map(([x, y]) => [x * 0.3 + 3, y * 0.3 + 3] as [number, number]),
        ],
      });
      expect(cw(g.coordinates[0] as Ring)).toBe(true);
      expect(cw((g.coordinates as Ring[])[1] as Ring)).toBe(false);
    }
    const open = normalizeGeometry({
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [0, 5],
          [5, 5],
          [5, 0],
        ],
      ],
    });
    const ring = open.coordinates[0] as Ring;
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });
  it("rounds to 6 decimals and drops consecutive duplicate points", () => {
    const g = normalizeGeometry({
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [0.0000001, 0],
          [0, 1.0000004],
          [1, 1],
          [1, 0],
          [0, 0],
        ],
      ],
    });
    const ring = g.coordinates[0] as Ring;
    expect(ring.every(([x, y]) => x === round6(x) && y === round6(y))).toBe(true);
    for (let i = 1; i < ring.length; i++) expect(ring[i]).not.toEqual(ring[i - 1]);
  });
  it("is idempotent", () => {
    const g: Geometry = {
      type: "MultiPolygon",
      coordinates: [[square(0, 0, 4)], [square(10, 10, 2)]],
    };
    const once = normalizeGeometry(g);
    expect(normalizeGeometry(once)).toEqual(once);
  });
});

describe("boundingBox", () => {
  it("is the ordinary box for ordinary shapes", () => {
    expect(boundingBox({ type: "Polygon", coordinates: [square(10, -5, 20)] })).toEqual([
      10, -5, 30, 15,
    ]);
  });
  it("wraps the antimeridian for Fiji-like shapes (minLon > maxLon) and stays small", () => {
    const east = square(176, -20, 3.9);
    const west = square(-180, -19, 2);
    const [w, s, e, n] = boundingBox({ type: "MultiPolygon", coordinates: [[east], [west]] });
    expect(w).toBe(176);
    expect(e).toBe(-178);
    expect([s, n]).toEqual([-20, -16.1]);
    expect(w).toBeGreaterThan(e);
  });
  it("covers the whole circle for polar shapes", () => {
    // Vertices every 30° of longitude all the way round, like Antarctica's outline.
    const ring: Ring = [
      ...Array.from(
        { length: 13 },
        (_, i) => [-180 + i * 30, -80 - (i % 2) * 5] as [number, number],
      ),
      [180, -90],
      [-180, -90],
    ];
    const [w, , e] = boundingBox({ type: "Polygon", coordinates: [ring] });
    expect([w, e]).toEqual([-180, 180]);
  });
});

describe("refPoint (pole of inaccessibility of the largest polygon)", () => {
  it("lands inside a concave C shape where the centroid would not", () => {
    const c: Ring = [
      [0, 0],
      [10, 0],
      [10, 2],
      [2, 2],
      [2, 8],
      [10, 8],
      [10, 10],
      [0, 10],
      [0, 0],
    ];
    const g = normalizeGeometry({ type: "Polygon", coordinates: [c] });
    const [lat, lon] = refPoint(g);
    expect(pointInsideLargest(g, [lat, lon])).toBe(true);
    expect(lon).toBeLessThan(2.5); // in the thick spine, not the hollow
  });
  it("uses the largest polygon, so overseas pieces do not drag it away (the France rule)", () => {
    const g: Geometry = normalizeGeometry({
      type: "MultiPolygon",
      coordinates: [[square(0, 40, 8)], [square(-60, 3, 2)], [square(55, -21, 1)]],
    });
    expect(largestPolygon(g)).toEqual(
      (g as Extract<Geometry, { type: "MultiPolygon" }>).coordinates[0],
    );
    const [lat, lon] = refPoint(g);
    expect(lat).toBeGreaterThan(40);
    expect(lon).toBeGreaterThan(0);
    expect(lon).toBeLessThan(8);
  });
  it("resolves microstates: a polygon far smaller than 0.01° still gets a point inside it (the Vatican case)", () => {
    const tiny = normalizeGeometry({
      type: "Polygon",
      coordinates: [
        [
          [12.4527, 41.9028],
          [12.454, 41.9028],
          [12.4541, 41.9039],
          [12.4528, 41.904],
          [12.4527, 41.9028],
        ],
      ],
    });
    const [lat, lon] = refPoint(tiny);
    expect(pointInsideLargest(tiny, [lat, lon])).toBe(true);
    expect(lon).toBeGreaterThan(12.4527);
    expect(lon).toBeLessThan(12.4541);
  });
  it("is deterministic", () => {
    const g = normalizeGeometry({
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [7, 1],
          [9, 6],
          [3, 9],
          [0, 0],
        ],
      ],
    });
    expect(refPoint(g)).toEqual(refPoint(g));
  });
});
