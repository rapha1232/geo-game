"use client";

import { geoClipRectangle, geoGraticule10, geoPath, type GeoProjection } from "d3-geo";
import { select } from "d3-selection";
import {
  zoom as d3zoom,
  zoomIdentity,
  zoomTransform,
  type D3ZoomEvent,
  type ZoomBehavior,
  type ZoomTransform,
} from "d3-zoom";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { merge, neighbors } from "topojson-client";
import type { Topology } from "topojson-specification";
import { Button } from "../components/Button";
import { MapStylePicker } from "../components/MapStylePicker";
import { cx } from "../components/cx";
import { decodeFeatures, featureAt, featureObject, round4, type MapFeature } from "./geo";
import {
  LOUPE_RADIUS_PX,
  LOUPE_ZOOM,
  candidatesNear,
  ringAt,
  tinyRings,
  type PointerKind,
  type Ring,
} from "./hit";
import { NavIndex, type Direction } from "./keynav";
import { colourSlots, type MapStyle } from "./mapStyle";
import { Patterns } from "./Patterns";
import { worldProjection } from "./projection";
import {
  DRAG_THRESHOLD_PX,
  IDENTITY,
  MAX_ZOOM,
  MIN_ZOOM,
  baseToScreen,
  isDrag,
  lodForZoom,
  pickLod,
  screenToBase,
  type Lod,
  type Transform,
} from "./view";
import styles from "./GameMap.module.css";

/** Feedback state of a feature. Each one has a pattern or outline as well as a colour (AC-PL-008). */
export type MapFeatureState =
  "idle" | "correct" | "wrong" | "near" | "disputed" | "nodata" | "highlight";
export type MapMode = "view" | "select" | "highlight" | "free-pin";
export type MapEntity = {
  id: string;
  name: string;
  /** [lat, lon] */ labelPoint: readonly [number, number];
};
export type Pin = { lat: number; lon: number };

export type GameMapLabels = {
  zoomIn: string;
  zoomOut: string;
  zoomReset: string;
  /** Spoken when keyboard focus moves to a feature. */
  focused: (name: string) => string;
  /** Shown inside the touch loupe. */
  loupeHint: string;
  /** Spoken when the pin moves. */
  pinAt: (lat: number, lon: number) => string;
  /** Adds a map-style switcher to the controls when given (translated by the caller). */
  mapStyle?: { label: string; names: Record<MapStyle, string> };
};

export type GameMapProps = {
  /** Loaded geometry packs by level of detail. Missing levels are requested through `onNeedLod`. */
  lods: Partial<Record<Lod, Topology>>;
  entities: readonly MapEntity[];
  states?: Readonly<Record<string, MapFeatureState>>;
  /** Choropleth classes 0 to 4 for features whose state is idle (sequential fills; a legend belongs next to the map). */
  classes?: Readonly<Record<string, number>>;
  /** Features drawn faded and desaturated, e.g. the non-matches of a filter. */
  dimmed?: ReadonlySet<string>;
  /** Features that carry a small dot at their label point (e.g. the countries a player missed). */
  markers?: ReadonlySet<string>;
  /** The feature under the pointer, or focused with the keyboard; null when there is none. */
  onHover?: (id: string | null) => void;
  mode: MapMode;
  onSelect?: (id: string) => void;
  pin?: Pin | null;
  onPinChange?: (pin: Pin) => void;
  /** The right answer, drawn after a reveal with a line from the pin. */
  target?: Pin | null;
  onNeedLod?: (lod: Lod) => void;
  "aria-label": string;
  labels: GameMapLabels;
  /** Overrides pointer detection (tests, accessibility settings). */
  pointer?: PointerKind;
  /**
   * Features the view should frame: the map opens fitted to their label points, and the reset button returns
   * there. Used by regional quizzes so Europe opens on Europe. Omit (or pass the whole world) for the full map.
   */
  focus?: readonly string[];
  className?: string;
};

const PRIORITY: Record<MapFeatureState, number> = {
  idle: 0,
  nodata: 1,
  disputed: 2,
  near: 3,
  wrong: 4,
  correct: 5,
  highlight: 6,
};
const KEY_DIRECTION: Record<string, Direction> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};
const LOUPE_SIZE = 56;
/** A highlighted feature should fill at least 15% of the viewport (quiz-library §5.4). */
const HIGHLIGHT_FILL = 0.15;

const prefersReducedMotion = (): boolean =>
  typeof window === "undefined" ||
  typeof window.matchMedia !== "function" ||
  typeof requestAnimationFrame !== "function" ||
  document.documentElement.getAttribute("data-motion") === "reduce" ||
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Smooth-in-and-out curve for animated zooms. */
const easeInOut = (x: number): number =>
  x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

/** [x0, y0, x1, y1] in base (unzoomed) map coordinates. */
type Rect = readonly [number, number, number, number];
const transformAttr = (t: Transform): string => `translate(${t.x} ${t.y}) scale(${t.k})`;
/** The part of the base map on screen under transform `t`. */
const viewRect = (t: Transform, w: number, h: number): Rect => [
  -t.x / t.k,
  -t.y / t.k,
  (w - t.x) / t.k,
  (h - t.y) / t.k,
];
const grow = ([x0, y0, x1, y1]: Rect, by: number): Rect => {
  const [dx, dy] = [(x1 - x0) * by, (y1 - y0) * by];
  return [x0 - dx, y0 - dy, x1 + dx, y1 + dy];
};
const inside = (a: Rect, b: Rect): boolean =>
  a[0] >= b[0] && a[1] >= b[1] && a[2] <= b[2] && a[3] <= b[3];
const overlaps = (a: Rect, b: Rect): boolean =>
  a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
/**
 * Coordinate precision of path strings, in base units. One decimal is under 0.4 px of error up to the 7x zoom where
 * 50m hands over to 10m, and two decimals stay under 0.1 px at the 12x maximum. It roughly halves the path data.
 */
const DIGITS: Record<Lod, number> = { "110m": 1, "50m": 1, "10m": 2 };
/** Finer packs only draw what is near the view: the view plus this share of it on every side. */
const CULL_MARGIN = 0.5;

/**
 * A cheap projected bounding box from a feature's geographic bounds, used only to cull. Equal Earth is
 * pseudo-cylindrical, so sampling the box edges (and the equator when it is inside) bounds the outline closely.
 * Features across the antimeridian get the whole width.
 */
function approxBox(projection: GeoProjection, f: MapFeature): Rect {
  const [[w, s], [e, n]] = f.bounds;
  const lons = w <= e ? [w, (w + e) / 2, e] : [-180, 0, 180];
  const lats = [s, (s + n) / 2, n, ...(s < 0 && n > 0 ? [0] : [])];
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const lon of lons)
    for (const lat of lats) {
      const p = projection([lon, lat]);
      if (!p) continue;
      x0 = Math.min(x0, p[0]);
      x1 = Math.max(x1, p[0]);
      y0 = Math.min(y0, p[1]);
      y1 = Math.max(y1, p[1]);
    }
  return [x0, y0, x1, y1];
}

/** Merged coastlines per pack: the merge is the costliest step of a level-of-detail change, so it runs once. */
const coasts = new WeakMap<Topology, ReturnType<typeof merge> | null>();
/** Whether a feature crosses the antimeridian or reaches a pole, and so needs d3's antimeridian clip. */
const wraps = (f: MapFeature): boolean => {
  const [[w, s], [e, n]] = f.bounds;
  return w > e || w <= -179.9 || e >= 179.9 || s <= -89.9 || n >= 89.9;
};

/** The outer coastline of a pack (internal borders removed), for the shadow and water lines. */
function coastOf(topology: Topology | undefined) {
  const object = featureObject(topology);
  if (!topology || !object) return null;
  if (coasts.has(topology)) return coasts.get(topology) ?? null;
  let shape: ReturnType<typeof merge> | null = null;
  try {
    shape = merge(topology, object.geometries as never);
  } catch {
    shape = null;
  }
  coasts.set(topology, shape);
  return shape;
}

function useElementSize() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 800, h: 450 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0)
        setSize((s) => (s.w === r.width && s.h === r.height ? s : { w: r.width, h: r.height }));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, size };
}

function usePointerKind(override?: PointerKind): PointerKind {
  const [kind, setKind] = useState<PointerKind>("fine");
  useEffect(() => {
    if (override || typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(pointer: coarse)");
    const update = () => setKind(mq.matches ? "coarse" : "fine");
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [override]);
  return override ?? kind;
}

export function GameMap({
  lods,
  entities,
  states = {},
  classes,
  dimmed,
  markers,
  onHover,
  mode,
  onSelect,
  pin = null,
  onPinChange,
  target = null,
  onNeedLod,
  labels,
  pointer,
  focus,
  className,
  ...rest
}: GameMapProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const patternIds = useMemo(
    () => ({
      hatch: `${uid}-hatch`,
      dots: `${uid}-dots`,
      cross: `${uid}-cross`,
      light: `${uid}-light`,
    }),
    [uid],
  );
  const { ref: rootRef, size } = useElementSize();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const zoomRef = useRef<ZoomBehavior<HTMLDivElement, unknown> | null>(null);
  const pointerKind = usePointerKind(pointer);

  /**
   * The transform React last rendered. While a gesture or flight runs, the already-drawn SVG is moved as one
   * GPU layer (`paint`), and React redraws it only when the movement settles, so panning never re-renders or
   * re-rasterises the map.
   */
  const [t, setT] = useState<Transform>(IDENTITY);
  const committedK = t.k;
  /** The transform on screen right now, including a gesture in progress. */
  const live = useRef<Transform>(IDENTITY);
  const worldRef = useRef<SVGGElement | null>(null);
  const softCommit = useRef<number | null>(null);
  const rendered = useRef<Transform>(IDENTITY);
  rendered.current = t;
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loupe, setLoupe] = useState<{ x: number; y: number } | null>(null);
  const [announce, setAnnounce] = useState("");
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [styleOpen, setStyleOpen] = useState(false);
  const down = useRef<{ x: number; y: number } | null>(null);
  const anim = useRef<number | null>(null);
  const animating = useRef(false);
  /** Set once the player pans or zooms, so a late layout change never yanks the view back. */
  const userMoved = useRef(false);

  const available = (Object.keys(lods) as Lod[]).filter((l) => lods[l]);
  const wanted = lodForZoom(committedK);
  const lod = pickLod(wanted, available);
  useEffect(() => {
    if (!available.includes(wanted)) onNeedLod?.(wanted);
  }, [wanted, available.join(","), onNeedLod]);
  // The first zoom past 3x needs the 50m pack. Fetch, parse and decode it while the browser is idle, so that
  // zoom doesn't stall on it.
  const has110 = !!lods["110m"];
  const has50 = !!lods["50m"];
  useEffect(() => {
    if (!has110 || typeof requestIdleCallback !== "function") return;
    const id = requestIdleCallback(
      () => {
        if (!has50) onNeedLod?.("50m");
        else {
          decode(lods["50m"]);
          coastOf(lods["50m"]);
        }
      },
      { timeout: 4000 },
    );
    return () => cancelIdleCallback(id);
  }, [has110, has50, onNeedLod]);

  /** Decoded packs, kept per topology so going back to a level of detail costs nothing. */
  const decoded = useRef(new WeakMap<Topology, MapFeature[]>());
  const decode = useCallback((topo: Topology | undefined): MapFeature[] => {
    if (!topo) return [];
    let f = decoded.current.get(topo);
    if (!f) decoded.current.set(topo, (f = decodeFeatures(topo)));
    return f;
  }, []);
  const features = useMemo<MapFeature[]>(
    () => decode(lod ? lods[lod] : undefined),
    [lod, lods, decode],
  );
  /** Hover runs on every pointer move, so it tests against 50m outlines at most. */
  const hoverFeatures = useMemo<MapFeature[]>(
    () => (lod === "10m" && lods["50m"] ? decode(lods["50m"]) : features),
    [lod, lods, features, decode],
  );
  const projection = useMemo(() => worldProjection(size.w, size.h), [size.w, size.h]);
  /** The sphere outline and graticule: long curved lines, so they keep d3's adaptive resampling. */
  const framePath = useMemo(() => geoPath(projection).digits(1), [projection]);
  /**
   * Land and coast. 50m and 10m outlines are already denser than a pixel, so adaptive resampling (the costliest
   * step of building their paths in profiling) is turned off for them.
   */
  const landProjection = useCallback(
    (wraps = true) => {
      const p = worldProjection(size.w, size.h);
      if (lod && lod !== "110m") p.precision(0);
      // Countries that neither cross the antimeridian nor touch a pole skip d3's antimeridian clip, whose
      // per-ring spherical inside test was the single costliest step of drawing them.
      if (!wraps) p.preclip((stream) => stream);
      return p;
    },
    [size.w, size.h, lod],
  );
  const path = useMemo(
    () => geoPath(landProjection()).digits(DIGITS[lod ?? "110m"]),
    [landProjection, lod],
  );
  const plainPath = useMemo(
    () => geoPath(landProjection(false)).digits(DIGITS[lod ?? "110m"]),
    [landProjection, lod],
  );
  /** A 10° graticule under the land: decorative, gives the ocean depth and a sense of the projection. */
  const graticule = useMemo(() => framePath(geoGraticule10()) ?? "", [framePath]);
  const sphere = useMemo(() => framePath({ type: "Sphere" }) ?? "", [framePath]);

  /** Outer coastline for the land shadow and water lines. At 10m the 50m coast is close enough and far cheaper. */
  const coastLod: Lod | null = lod === "10m" && lods["50m"] ? "50m" : lod;
  const coastShape = useMemo(() => (coastLod ? coastOf(lods[coastLod]) : null), [coastLod, lods]);

  /**
   * The area drawn at 50m and 10m: the view grown by CULL_MARGIN, kept until the view leaves it or zooms in past
   * 1.5 times its scale, so small pans reuse the same paths. At 110m the whole world is drawn.
   */
  const cullRef = useRef<{ rect: Rect; k: number; lod: Lod; w: number; h: number } | null>(null);
  const cull: Rect | null = (() => {
    if (!lod || lod === "110m") return (cullRef.current = null);
    const view = viewRect(t, size.w, size.h);
    const c = cullRef.current;
    if (
      c &&
      c.lod === lod &&
      c.w === size.w &&
      c.h === size.h &&
      inside(view, c.rect) &&
      t.k < c.k * 1.5
    )
      return c.rect;
    cullRef.current = { rect: grow(view, CULL_MARGIN), k: t.k, lod, w: size.w, h: size.h };
    return cullRef.current.rect;
  })();

  /**
   * Paths clipped to the culled area. Countries and the coast are drawn through it, so a corner of Russia on screen
   * costs a corner of Russia, not its whole 10m outline (and the coast, drawn five times over, the same).
   */
  const clippedPath = useMemo(
    () =>
      cull
        ? geoPath(
            landProjection().postclip(geoClipRectangle(cull[0], cull[1], cull[2], cull[3])),
          ).digits(DIGITS[lod ?? "110m"])
        : path,
    [cull, path, lod, landProjection],
  );
  const clippedPlainPath = useMemo(
    () =>
      cull
        ? geoPath(
            landProjection(false).postclip(geoClipRectangle(cull[0], cull[1], cull[2], cull[3])),
          ).digits(DIGITS[lod ?? "110m"])
        : plainPath,
    [cull, plainPath, lod, landProjection],
  );
  const coast = useMemo(
    () => (coastShape ? (clippedPath(coastShape) ?? "") : ""),
    [coastShape, clippedPath],
  );

  /**
   * A colour slot (0–5) per feature so neighbours differ; styles map slots to colours (political) or to
   * near-identical tones. Fixed the first time an id is seen, so colours never shuffle between detail levels.
   */
  const slotsRef = useRef<Map<string, number>>(new Map());
  const slots = useMemo(() => {
    const topo = lod ? lods[lod] : undefined;
    const object = featureObject(topo);
    if (object?.geometries.some((g) => g.id !== undefined && !slotsRef.current.has(String(g.id)))) {
      const ids = object.geometries.map((g) => String(g.id ?? ""));
      for (const [id, v] of colourSlots(ids, neighbors(object.geometries as never)))
        if (!slotsRef.current.has(id)) slotsRef.current.set(id, v);
    }
    return slotsRef.current;
  }, [lod, lods]);

  /**
   * Path and on-screen size per feature, built the first time a feature is drawn at this detail, size and culled
   * area. The size comes from the whole outline, so a partly clipped country still counts as large.
   */
  type Shape = { id: string; d: string; base: number };
  /** Whole outlines, kept for as long as the detail level and size hold, whatever the culled area. */
  const wholeShapes = useMemo(() => new Map<string, Shape>(), [features, path]);
  /** Outlines that cross the culled area's edge, clipped to it; rebuilt when the area changes. */
  const clippedShapes = useMemo(() => new Map<string, Shape>(), [features, clippedPath]);
  const bases = useMemo(() => new Map<string, number>(), [features, path]);
  const shapeOf = useCallback(
    (f: MapFeature, box?: Rect) => {
      const clip = !!cull && !!box && !inside(box, cull);
      const cache = clip ? clippedShapes : wholeShapes;
      let sh = cache.get(f.id);
      if (!sh) {
        let base = bases.get(f.id);
        if (base === undefined) {
          const [[x0, y0], [x1, y1]] = (wraps(f) ? path : plainPath).bounds(f.geometry);
          bases.set(f.id, (base = Math.max(x1 - x0, y1 - y0)));
        }
        const draw = wraps(f) ? (clip ? clippedPath : path) : clip ? clippedPlainPath : plainPath;
        sh = { id: f.id, d: draw(f.geometry) ?? "", base };
        cache.set(f.id, sh);
      }
      return sh;
    },
    [cull, clippedShapes, wholeShapes, bases, path, plainPath, clippedPath, clippedPlainPath],
  );
  const drawn = useMemo(() => {
    if (!cull) return features.map((f) => shapeOf(f));
    const out: Shape[] = [];
    for (const f of features) {
      const box = approxBox(projection, f);
      if (overlaps(box, cull)) out.push(shapeOf(f, box));
    }
    return out;
  }, [features, cull, projection, shapeOf]);
  const featureIds = useMemo(() => new Set(features.map((f) => f.id)), [features]);

  const names = useMemo(() => new Map(entities.map((e) => [e.id, e.name] as const)), [entities]);
  const anchors = useMemo(() => {
    const m = new Map<string, [number, number]>();
    for (const e of entities) {
      const p = projection([e.labelPoint[1], e.labelPoint[0]]);
      if (p) m.set(e.id, p);
    }
    return m;
  }, [entities, projection]);
  const nav = useMemo(
    () =>
      new NavIndex(
        entities.flatMap((e) =>
          anchors.has(e.id) && featureIds.has(e.id)
            ? [
                {
                  id: e.id,
                  x: (anchors.get(e.id) as [number, number])[0],
                  y: (anchors.get(e.id) as [number, number])[1],
                },
              ]
            : [],
        ),
      ),
    [entities, anchors, featureIds],
  );

  /** The framed view for `focus`: label points with outliers trimmed, padded, never past 8×. */
  const focusKey = focus?.join(",") ?? "";
  const home = useMemo((): ZoomTransform => {
    const pts = (focus ?? []).flatMap((id) => anchors.get(id) ?? []);
    if (pts.length < 2) return zoomIdentity;
    const xs = pts.filter((_, i) => i % 2 === 0).sort((a, b) => a - b);
    const ys = pts.filter((_, i) => i % 2 === 1).sort((a, b) => a - b);
    const trim = Math.floor(xs.length * 0.04);
    const [x0, x1] = [xs[trim] as number, xs[xs.length - 1 - trim] as number];
    const [y0, y1] = [ys[trim] as number, ys[ys.length - 1 - trim] as number];
    const pad = 0.28;
    const bw = Math.max(x1 - x0, 1) * (1 + pad * 2);
    const bh = Math.max(y1 - y0, 1) * (1 + pad * 2);
    const k = Math.min(8, size.w / bw, size.h / bh);
    if (k < 1.2) return zoomIdentity;
    const [cx, cy] = [(x0 + x1) / 2, (y0 + y1) / 2];
    // Keep the frame inside the world, like the pan limits do.
    const tx = Math.min(0, Math.max(size.w - size.w * k, size.w / 2 - k * cx));
    const ty = Math.min(0, Math.max(size.h - size.h * k, size.h / 2 - k * cy));
    return zoomIdentity.translate(tx, ty).scale(k);
  }, [focusKey, anchors, size.w, size.h]);

  /** Tiny-target rings in screen space, recomputed with the zoom. */
  const rings: Ring[] = useMemo(() => {
    if (mode !== "select" && mode !== "highlight") return [];
    const measured = drawn.flatMap((d) => {
      const a = anchors.get(d.id);
      if (!a) return [];
      const [cx, cy] = baseToScreen(t, a[0], a[1]);
      return [{ id: d.id, sizePx: d.base * t.k, cx, cy }];
    });
    return tinyRings(measured, pointerKind);
  }, [drawn, anchors, t, pointerKind, mode]);

  const ordered = useMemo(
    () =>
      [...drawn].sort(
        (a, b) => PRIORITY[states[a.id] ?? "idle"] - PRIORITY[states[b.id] ?? "idle"],
      ),
    [drawn, states],
  );

  /** Geographic hit test at a screen point. */
  const polygonAt = useCallback(
    (sx: number, sy: number, among: readonly MapFeature[] = features): string | null => {
      const [bx, by] = screenToBase(live.current, sx, sy);
      const ll = projection.invert?.([bx, by]);
      return ll ? featureAt(among, ll[0], ll[1]) : null;
    },
    [projection, features],
  );

  const commit = useCallback((n: Transform) => {
    live.current = n;
    setT((cur) => (cur.k === n.k && cur.x === n.x && cur.y === n.y ? cur : n));
  }, []);
  /**
   * Puts transform `n` on screen without React or raster work: the SVG as drawn for the last rendered transform is
   * moved and scaled with a CSS transform, which the compositor does on the GPU. Once the view has drifted a third
   * of the screen or zoomed 1.6x from what was drawn, it is redrawn for real, so long drags never show much bare sea.
   */
  const paint = useCallback(
    (n: Transform) => {
      live.current = n;
      const svg = svgRef.current;
      if (!svg) return;
      const c = rendered.current;
      const s = n.k / c.k;
      const [dx, dy] = [n.x - s * c.x, n.y - s * c.y];
      svg.style.transform = `translate(${dx}px, ${dy}px) scale(${s})`;
      const far = Math.abs(dx) > size.w / 3 || Math.abs(dy) > size.h / 3 || s > 1.6 || s < 1 / 1.6;
      if (
        far &&
        !animating.current &&
        softCommit.current === null &&
        typeof requestAnimationFrame === "function"
      )
        softCommit.current = requestAnimationFrame(() => {
          softCommit.current = null;
          commit(live.current);
        });
    },
    [size.w, size.h, commit],
  );
  // Once React has drawn a transform, the SVG needs no CSS correction. In a layout effect, so the redraw and the
  // reset land in the same frame.
  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (svg) svg.style.transform = "";
  }, [t]);
  useEffect(
    () => () => {
      if (softCommit.current !== null) cancelAnimationFrame(softCommit.current);
    },
    [],
  );

  // d3-zoom owns the gesture; React state follows it. It listens on the root, not the SVG, because the SVG is
  // moved with a CSS transform mid-gesture and pointer maths on it would feed back into the gesture.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const behavior = d3zoom<HTMLDivElement, unknown>()
      .scaleExtent([MIN_ZOOM, MAX_ZOOM])
      .extent([
        [0, 0],
        [size.w, size.h],
      ])
      .translateExtent([
        [0, 0],
        [size.w, size.h],
      ])
      .clickDistance(DRAG_THRESHOLD_PX)
      .on("start", (e: D3ZoomEvent<HTMLDivElement, unknown>) => {
        if (e.sourceEvent) userMoved.current = true;
        setMoving(true);
      })
      .on("zoom", (e: D3ZoomEvent<HTMLDivElement, unknown>) =>
        paint({ k: e.transform.k, x: e.transform.x, y: e.transform.y }),
      )
      .on("end", (e: D3ZoomEvent<HTMLDivElement, unknown>) => {
        // Animated zooms commit once at the end, so the detail level never swaps mid-flight.
        if (animating.current) return;
        setMoving(false);
        commit({ k: e.transform.k, x: e.transform.x, y: e.transform.y });
      });
    zoomRef.current = behavior;
    select(root).call(behavior);
    return () => {
      select(root).on(".zoom", null);
    };
  }, [size.w, size.h, paint, commit]);

  /** Moves the view to `next`: a short eased flight, or an instant jump with reduced motion. */
  const flyTo = useCallback(
    (next: ZoomTransform) => {
      const svg = rootRef.current;
      const behavior = zoomRef.current;
      if (!svg || !behavior) return;
      const sel = select(svg);
      if (anim.current !== null) cancelAnimationFrame(anim.current);
      anim.current = null;
      if (prefersReducedMotion()) {
        animating.current = false;
        sel.call(behavior.transform, next);
        return;
      }
      const from = zoomTransform(svg);
      const mid: [number, number] = [size.w / 2, size.h / 2];
      const [ax, ay] = from.invert(mid);
      const [bx, by] = next.invert(mid);
      const [lk0, lk1] = [Math.log(from.k), Math.log(next.k)];
      const dur = Math.min(
        600,
        260 + 90 * Math.abs(lk1 - lk0) + Math.hypot(ax - bx, ay - by) * 0.15,
      );
      const start = performance.now();
      animating.current = true;
      const step = (now: number) => {
        const p = Math.min(1, (now - start) / dur);
        const e = easeInOut(p);
        const k = Math.exp(lk0 + (lk1 - lk0) * e);
        const [cx, cy] = [ax + (bx - ax) * e, ay + (by - ay) * e];
        sel.call(
          behavior.transform,
          zoomIdentity.translate(mid[0] - k * cx, mid[1] - k * cy).scale(k),
        );
        if (p < 1) {
          anim.current = requestAnimationFrame(step);
          return;
        }
        anim.current = null;
        animating.current = false;
        setMoving(false);
        const end = zoomTransform(svg);
        commit({ k: end.k, x: end.x, y: end.y });
      };
      anim.current = requestAnimationFrame(step);
    },
    [size.w, size.h, commit],
  );
  useEffect(
    () => () => {
      if (anim.current !== null) cancelAnimationFrame(anim.current);
    },
    [],
  );

  const zoomBy = useCallback(
    (factor: number) => {
      const root = rootRef.current;
      if (!root) return;
      userMoved.current = true;
      const cur = zoomTransform(root);
      const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, cur.k * factor));
      const [cx, cy] = cur.invert([size.w / 2, size.h / 2]);
      flyTo(zoomIdentity.translate(size.w / 2 - k * cx, size.h / 2 - k * cy).scale(k));
    },
    [flyTo, size.w, size.h],
  );
  const zoomReset = useCallback(() => {
    userMoved.current = false;
    flyTo(home);
  }, [flyTo, home]);
  // Open on the focus frame, and follow it while the player hasn't moved the map themselves.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !zoomRef.current || userMoved.current) return;
    const cur = zoomTransform(root);
    if (cur.k === home.k && cur.x === home.x && cur.y === home.y) return;
    select(root).call(zoomRef.current.transform, home);
  }, [home]);
  const zoomTo = useCallback(
    (bx: number, by: number, k: number) => {
      const kk = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k));
      flyTo(zoomIdentity.translate(size.w / 2 - kk * bx, size.h / 2 - kk * by).scale(kk));
    },
    [flyTo, size.w, size.h],
  );

  // A highlighted target that is tiny gets zoomed to, so it fills at least 15% of the viewport.
  const highlightId = useMemo(
    () => Object.entries(states).find(([, s]) => s === "highlight")?.[0] ?? null,
    [states],
  );
  useEffect(() => {
    if (mode !== "highlight" || !highlightId) return;
    const f = features.find((x) => x.id === highlightId);
    const d = f ? shapeOf(f) : undefined;
    const a = anchors.get(highlightId);
    if (!d || !a) return;
    const need = (HIGHLIGHT_FILL * Math.min(size.w, size.h)) / Math.max(d.base, 0.5);
    if (need > 1.5) zoomTo(a[0], a[1], need);
  }, [highlightId, mode]);

  const rel = (e: { clientX: number; clientY: number }): [number, number] => {
    // The root, not the SVG: the SVG may carry a CSS transform while a gesture settles.
    const r = rootRef.current?.getBoundingClientRect();
    return [e.clientX - (r?.left ?? 0), e.clientY - (r?.top ?? 0)];
  };

  const choose = useCallback(
    (sx: number, sy: number, allowLoupe: boolean) => {
      if (mode === "free-pin") {
        const [bx, by] = screenToBase(live.current, sx, sy);
        const ll = projection.invert?.([bx, by]);
        if (ll) onPinChange?.({ lat: round4(ll[1]), lon: round4(ll[0]) });
        return;
      }
      if (mode !== "select" && mode !== "highlight") return;
      if (allowLoupe && pointerKind === "coarse") {
        const near = candidatesNear(rings, sx, sy, polygonAt, LOUPE_RADIUS_PX);
        if (near.length > 1) {
          setLoupe({ x: sx, y: sy });
          return;
        }
      }
      const id = ringAt(rings, sx, sy)?.id ?? polygonAt(sx, sy);
      if (id) onSelect?.(id);
    },
    [mode, projection, rings, polygonAt, pointerKind, onPinChange, onSelect],
  );

  const loupeCenter = loupe
    ? {
        x: Math.min(Math.max(loupe.x, LOUPE_SIZE + 4), size.w - LOUPE_SIZE - 4),
        y: Math.max(loupe.y - LOUPE_SIZE - 28, LOUPE_SIZE + 4),
      }
    : null;

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    down.current = { x: e.clientX, y: e.clientY };
  };
  const hovered = useRef<string | null>(null);
  const tracksHover = !!onHover || mode === "select" || mode === "highlight";
  /** Hover is hit-tested at most once a frame, on the latest pointer position. */
  const hoverAt = useRef<[number, number] | null>(null);
  const hoverFrame = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (hoverFrame.current !== null) cancelAnimationFrame(hoverFrame.current);
    },
    [],
  );
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (!tracksHover || e.pointerType === "touch" || down.current || moving) return;
    const at = rel(e);
    // Browsers send pointer moves after the page redraws under a still pointer; those need no new hit test.
    const last = hoverAt.current;
    if (last && last[0] === at[0] && last[1] === at[1]) return;
    hoverAt.current = at;
    const run = () => {
      hoverFrame.current = null;
      const at = hoverAt.current;
      if (!at) return;
      const id = ringAt(rings, at[0], at[1])?.id ?? polygonAt(at[0], at[1], hoverFeatures) ?? null;
      if (id !== hovered.current) {
        hovered.current = id;
        setHoverId(id);
        onHover?.(id);
      }
    };
    if (typeof requestAnimationFrame !== "function") return run();
    if (hoverFrame.current === null) hoverFrame.current = requestAnimationFrame(run);
  };
  const onPointerLeave = () => {
    hoverAt.current = null;
    if (hovered.current !== null) {
      hovered.current = null;
      setHoverId(null);
      onHover?.(null);
    }
  };
  const onPointerUp = (e: PointerEvent<SVGSVGElement>) => {
    const start = down.current;
    down.current = null;
    if (!start || isDrag(e.clientX - start.x, e.clientY - start.y) || e.button > 0) return;
    const [sx, sy] = rel(e);
    if (loupe && loupeCenter) {
      // A second tap inside the loupe selects what is under the magnified point.
      if (Math.hypot(sx - loupeCenter.x, sy - loupeCenter.y) <= LOUPE_SIZE) {
        const px = loupe.x + (sx - loupeCenter.x) / LOUPE_ZOOM;
        const py = loupe.y + (sy - loupeCenter.y) / LOUPE_ZOOM;
        setLoupe(null);
        choose(px, py, false);
        return;
      }
      setLoupe(null);
    }
    choose(sx, sy, true);
  };

  const moveActive = (dir: Direction) => {
    const from = activeId ?? nav.nearest(size.w / 2, size.h / 2);
    if (!from) return;
    const next = activeId ? nav.next(from, dir) : from;
    if (!next) return;
    setActiveId(next);
    onHover?.(next);
    setAnnounce(labels.focused(names.get(next) ?? next));
    // Keep the focused feature on screen.
    const a = anchors.get(next);
    if (a) {
      const [sx, sy] = baseToScreen(t, a[0], a[1]);
      if (sx < 0 || sy < 0 || sx > size.w || sy > size.h) zoomTo(a[0], a[1], t.k);
    }
  };

  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    const dir = KEY_DIRECTION[e.key];
    if (e.key === "+" || e.key === "=") return void (e.preventDefault(), zoomBy(1.5));
    if (e.key === "-" || e.key === "_") return void (e.preventDefault(), zoomBy(1 / 1.5));
    if (e.key === "0") return void (e.preventDefault(), zoomReset());
    if (e.key === "Escape" && loupe) return void (e.preventDefault(), setLoupe(null));
    if (mode === "free-pin") {
      if (!dir) return;
      e.preventDefault();
      const step = Math.min(size.w, size.h) * 0.01 * (e.shiftKey ? 10 : 1);
      const cur = pin ? projection([pin.lon, pin.lat]) : null;
      const [cx, cy] = cur ? baseToScreen(t, cur[0], cur[1]) : [size.w / 2, size.h / 2];
      const [nx, ny] = [
        cx + (dir === "right" ? step : dir === "left" ? -step : 0),
        cy + (dir === "down" ? step : dir === "up" ? -step : 0),
      ];
      const ll = projection.invert?.(screenToBase(t, nx, ny));
      if (ll) {
        const next = { lat: round4(ll[1]), lon: round4(ll[0]) };
        onPinChange?.(next);
        setAnnounce(labels.pinAt(next.lat, next.lon));
      }
      return;
    }
    if (mode !== "select" && mode !== "highlight") return;
    if (dir) return void (e.preventDefault(), moveActive(dir));
    if ((e.key === "Enter" || e.key === " ") && activeId)
      return void (e.preventDefault(), onSelect?.(activeId));
  };

  const pinScreen = pin
    ? (() => {
        const p = projection([pin.lon, pin.lat]);
        return p ? baseToScreen(t, p[0], p[1]) : null;
      })()
    : null;

  const targetScreen = target
    ? (() => {
        const p = projection([target.lon, target.lat]);
        return p ? baseToScreen(t, p[0], p[1]) : null;
      })()
    : null;

  const stateClass = (s: MapFeatureState): string | undefined =>
    s === "idle" ? undefined : styles[s];
  const fillFor = (s: MapFeatureState): string | undefined =>
    s === "wrong"
      ? `url(#${patternIds.hatch})`
      : s === "near"
        ? `url(#${patternIds.dots})`
        : s === "disputed"
          ? `url(#${patternIds.cross})`
          : s === "nodata"
            ? `url(#${patternIds.light})`
            : undefined;

  const interactive = mode === "select" || mode === "highlight";
  const drawFeatures = (keyPrefix: string) =>
    ordered.map((d) => {
      const s = states[d.id] ?? "idle";
      const fill = fillFor(s);
      const cls = classes?.[d.id];
      return (
        <path
          key={`${keyPrefix}${d.id}`}
          {...(keyPrefix ? {} : { "data-id": d.id })}
          d={d.d}
          className={cx(
            styles.land,
            s === "idle" && cls === undefined && styles[`slot${slots.get(d.id) ?? 0}`],
            stateClass(s),
            s === "idle" && cls !== undefined && styles[`cls${cls}`],
            dimmed?.has(d.id) && styles.dimmed,
            interactive && hoverId === d.id && !keyPrefix && styles.hovered,
            activeId === d.id && !keyPrefix && styles.active,
          )}
          {...(fill ? { fill } : {})}
        />
      );
    });
  // The land layer is the heavy part of the map. Memoised, so panning and zooming only move its group.
  const landLayer = useMemo(
    () => drawFeatures(""),
    [ordered, states, classes, dimmed, slots, hoverId, activeId, interactive, patternIds],
  );

  const hoverPath = interactive && hoverId ? drawn.find((d) => d.id === hoverId)?.d : undefined;

  /** Tiny targets: a dot shaped by its state (filled ✓, cross ✕, ring ◐) plus a hit ring that shows on hover. */
  const ringMark = (r: Ring, key: string) => {
    const s = states[r.id] ?? "idle";
    const hot = interactive && (hoverId === r.id || activeId === r.id);
    return (
      <g
        key={key}
        className={cx(
          styles.tiny,
          s !== "idle" && styles[`tiny_${s}`],
          hot && styles.tinyHot,
          dimmed?.has(r.id) && styles.dimmed,
        )}
        transform={`translate(${r.cx} ${r.cy})`}
        {...(key === r.id ? { "data-ring": r.id } : {})}
      >
        <circle r={r.r} className={cx(styles.ring, s === "highlight" && styles.ringHighlight)} />
        {s === "wrong" ? (
          <path d="M-3 -3L3 3M3 -3L-3 3" className={styles.tinyCross} />
        ) : (
          <circle r={s === "idle" ? 2.6 : 3.6} className={styles.tinyDot} />
        )}
      </g>
    );
  };

  return (
    <div
      ref={rootRef}
      className={cx(styles.root, className)}
      data-mode={mode}
      data-lod={lod ?? ""}
      data-zoom={t.k.toFixed(2)}
      data-pointer={pointerKind}
      {...(moving ? { "data-moving": "" } : {})}
      {...(interactive && hoverId ? { "data-hover": "" } : {})}
      {...(features.length === 0 ? { "data-loading": "" } : {})}
    >
      <svg
        ref={svgRef}
        className={styles.svg}
        viewBox={`0 0 ${size.w} ${size.h}`}
        role="application"
        aria-roledescription="map"
        aria-label={rest["aria-label"]}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onKeyDown={onKeyDown}
      >
        <Patterns ids={patternIds} />
        <defs>
          <radialGradient id={`${uid}-ocean`} cx="50%" cy="40%" r="75%">
            <stop offset="0%" className={styles.oceanHi} />
            <stop offset="100%" className={styles.oceanLo} />
          </radialGradient>
        </defs>
        <rect width={size.w} height={size.h} className={styles.backdrop} />
        <g ref={worldRef} transform={transformAttr(t)}>
          <path d={sphere} className={styles.sphere} fill={`url(#${uid}-ocean)`} />
          <path d={graticule} className={styles.graticule} />
          {coast && (
            <g className={styles.coastLayer} aria-hidden="true">
              <path d={coast} className={cx(styles.waterline, styles.wl3)} />
              <path d={coast} className={cx(styles.waterline, styles.wl2)} />
              <path d={coast} className={cx(styles.waterline, styles.wl1)} />
              <path
                d={coast}
                className={styles.landShadow}
                transform={`translate(0 ${(1.8 / t.k).toFixed(3)})`}
              />
              <path d={coast} className={styles.coastEdge} />
            </g>
          )}
          <g className={styles.landLayer}>{landLayer}</g>
          {hoverPath && <path d={hoverPath} className={styles.hoverOutline} aria-hidden="true" />}
          <path d={sphere} className={styles.sphereEdge} />
        </g>
        <g>
          <g className={styles.rings}>{rings.map((r) => ringMark(r, r.id))}</g>
          {markers && markers.size > 0 && (
            <g className={styles.markers} data-markers="">
              {[...markers].flatMap((id) => {
                const a = anchors.get(id);
                if (!a) return [];
                const [cx, cy] = baseToScreen(t, a[0], a[1]);
                return [
                  <circle
                    key={id}
                    cx={cx}
                    cy={cy}
                    r={4.5}
                    className={styles.marker}
                    data-marker={id}
                  />,
                ];
              })}
            </g>
          )}
          {pinScreen && targetScreen && (
            <line
              x1={pinScreen[0]}
              y1={pinScreen[1]}
              x2={targetScreen[0]}
              y2={targetScreen[1]}
              className={styles.targetLine}
              data-target-line=""
            />
          )}
          {targetScreen && (
            <g transform={`translate(${targetScreen[0]} ${targetScreen[1]})`} data-target="">
              <circle r={9} className={styles.targetRing} />
              <circle r={3} className={styles.pinDot} />
            </g>
          )}
          {pinScreen && (
            <g transform={`translate(${pinScreen[0]} ${pinScreen[1]})`} data-pin="">
              <path d="M0 0 L-7 -15 A9 9 0 1 1 7 -15 Z" className={styles.pin} />
              <circle cy={-20} r={3} className={styles.pinDot} />
            </g>
          )}
        </g>
        {loupe && loupeCenter && (
          <g data-loupe="">
            <clipPath id={`${uid}-loupe`}>
              <circle cx={loupeCenter.x} cy={loupeCenter.y} r={LOUPE_SIZE} />
            </clipPath>
            <circle
              cx={loupeCenter.x}
              cy={loupeCenter.y}
              r={LOUPE_SIZE}
              className={styles.loupeFrame}
            />
            <g clipPath={`url(#${uid}-loupe)`}>
              <g
                transform={`translate(${loupeCenter.x} ${loupeCenter.y}) scale(${LOUPE_ZOOM}) translate(${-loupe.x} ${-loupe.y})`}
              >
                <g transform={`translate(${t.x} ${t.y}) scale(${t.k})`}>{drawFeatures("loupe-")}</g>
                {rings.map((r) => ringMark(r, `loupe-${r.id}`))}
              </g>
            </g>
            <text
              x={loupeCenter.x}
              y={loupeCenter.y + LOUPE_SIZE + 16}
              className={styles.loupeHint}
            >
              {labels.loupeHint}
            </text>
          </g>
        )}
      </svg>
      <div className={styles.controls}>
        {labels.mapStyle && (
          <Button
            className={cx(styles.zoomButton, styles.styleButton)}
            aria-label={labels.mapStyle.label}
            aria-expanded={styleOpen}
            onPress={() => setStyleOpen((o) => !o)}
          >
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              aria-hidden="true"
              className={styles.icon}
            >
              <path d="M12 3 2.5 8 12 13l9.5-5L12 3Z" />
              <path d="m2.5 12.5 9.5 5 9.5-5" />
              <path d="m2.5 17 9.5 5 9.5-5" />
            </svg>
          </Button>
        )}
        {labels.mapStyle && <span className={styles.controlsSep} aria-hidden="true" />}
        <Button
          className={styles.zoomButton ?? ""}
          aria-label={labels.zoomIn}
          onPress={() => zoomBy(1.5)}
        >
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            aria-hidden="true"
            className={styles.icon}
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
        </Button>
        <Button
          className={styles.zoomButton ?? ""}
          aria-label={labels.zoomOut}
          onPress={() => zoomBy(1 / 1.5)}
        >
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            aria-hidden="true"
            className={styles.icon}
          >
            <path d="M5 12h14" />
          </svg>
        </Button>
        <Button
          className={styles.zoomButton ?? ""}
          aria-label={labels.zoomReset}
          onPress={zoomReset}
        >
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            aria-hidden="true"
            className={styles.icon}
          >
            <circle cx="12" cy="12" r="8.5" />
            <path d="M3.5 12h17M12 3.5c2.6 2.4 3.8 5.2 3.8 8.5s-1.2 6.1-3.8 8.5c-2.6-2.4-3.8-5.2-3.8-8.5S9.4 5.9 12 3.5Z" />
          </svg>
        </Button>
      </div>
      {labels.mapStyle && styleOpen && (
        <StylePopover
          onClose={(viaKeyboard) => {
            setStyleOpen(false);
            if (viaKeyboard)
              rootRef.current?.querySelector<HTMLElement>(`.${styles.styleButton}`)?.focus();
          }}
        >
          <MapStylePicker
            compact
            autoFocus
            label={labels.mapStyle.label}
            names={labels.mapStyle.names}
          />
        </StylePopover>
      )}
      <p className="visually-hidden" aria-live="polite">
        {announce}
      </p>
    </div>
  );
}

/** A light popover next to the map controls. Escape or a press outside closes it. */
function StylePopover({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: (viaKeyboard: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onDown = (e: globalThis.PointerEvent) => {
      const el = ref.current;
      const target = e.target as Node | null;
      if (el && target && !el.contains(target) && !(target as Element).closest?.("[aria-expanded]"))
        onClose(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [onClose]);
  return (
    <div
      ref={ref}
      className={styles.stylePopover}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose(true);
        }
      }}
    >
      {children}
    </div>
  );
}
