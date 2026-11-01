"use client";

import { geoGraticule10, geoPath } from "d3-geo";
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
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { merge, neighbors } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import { Button } from "../components/Button";
import { MapStylePicker } from "../components/MapStylePicker";
import { cx } from "../components/cx";
import { decodeFeatures, featureAt, round4, type MapFeature } from "./geo";
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

/** The outer coastline of a pack (internal borders removed), for the shadow and water lines. */
function coastOf(topology: Topology | undefined) {
  const object = topology?.objects["countries"] as GeometryCollection | undefined;
  if (!topology || !object) return null;
  try {
    return merge(topology, object.geometries as never);
  } catch {
    return null;
  }
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
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const pointerKind = usePointerKind(pointer);

  const [t, setT] = useState<Transform>({ k: 1, x: 0, y: 0 });
  const [committedK, setCommittedK] = useState(1);
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

  const features = useMemo<MapFeature[]>(
    () => (lod && lods[lod] ? decodeFeatures(lods[lod] as Topology) : []),
    [lod, lods],
  );
  const projection = useMemo(() => worldProjection(size.w, size.h), [size.w, size.h]);
  const path = useMemo(() => geoPath(projection), [projection]);
  /** A 10° graticule under the land: decorative, gives the ocean depth and a sense of the projection. */
  const graticule = useMemo(() => path(geoGraticule10()) ?? "", [path]);
  const sphere = useMemo(() => path({ type: "Sphere" }) ?? "", [path]);

  /** Outer coastline for the land shadow and water lines. At 10m the 50m coast is close enough and far cheaper. */
  const coastLod: Lod | null = lod === "10m" && lods["50m"] ? "50m" : lod;
  const coastShape = useMemo(() => (coastLod ? coastOf(lods[coastLod]) : null), [coastLod, lods]);
  const coast = useMemo(() => (coastShape ? (path(coastShape) ?? "") : ""), [coastShape, path]);

  /**
   * A colour slot (0–5) per feature so neighbours differ; styles map slots to colours (political) or to
   * near-identical tones. Fixed the first time an id is seen, so colours never shuffle between detail levels.
   */
  const slotsRef = useRef<Map<string, number>>(new Map());
  const slots = useMemo(() => {
    const topo = lod ? lods[lod] : undefined;
    const object = topo?.objects["countries"] as GeometryCollection | undefined;
    if (object?.geometries.some((g) => g.id !== undefined && !slotsRef.current.has(String(g.id)))) {
      const ids = object.geometries.map((g) => String(g.id ?? ""));
      for (const [id, v] of colourSlots(ids, neighbors(object.geometries as never)))
        if (!slotsRef.current.has(id)) slotsRef.current.set(id, v);
    }
    return slotsRef.current;
  }, [lod, lods]);

  const drawn = useMemo(() => {
    return features.map((f) => {
      const [[x0, y0], [x1, y1]] = path.bounds(f.geometry);
      return { id: f.id, d: path(f.geometry) ?? "", base: Math.max(x1 - x0, y1 - y0) };
    });
  }, [features, path]);

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
          anchors.has(e.id) && drawn.some((d) => d.id === e.id)
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
    [entities, anchors, drawn],
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
    (sx: number, sy: number): string | null => {
      const [bx, by] = screenToBase(t, sx, sy);
      const ll = projection.invert?.([bx, by]);
      return ll ? featureAt(features, ll[0], ll[1]) : null;
    },
    [t, projection, features],
  );

  // d3-zoom owns the gesture; React state follows it.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const behavior = d3zoom<SVGSVGElement, unknown>()
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
      .on("start", (e: D3ZoomEvent<SVGSVGElement, unknown>) => {
        if (e.sourceEvent) userMoved.current = true;
        setMoving(true);
      })
      .on("zoom", (e: D3ZoomEvent<SVGSVGElement, unknown>) =>
        setT({ k: e.transform.k, x: e.transform.x, y: e.transform.y }),
      )
      .on("end", (e: D3ZoomEvent<SVGSVGElement, unknown>) => {
        // Animated zooms commit once at the end, so the detail level never swaps mid-flight.
        if (animating.current) return;
        setMoving(false);
        setCommittedK(e.transform.k);
      });
    zoomRef.current = behavior;
    select(svg).call(behavior);
    return () => {
      select(svg).on(".zoom", null);
    };
  }, [size.w, size.h]);

  /** Moves the view to `next`: a short eased flight, or an instant jump with reduced motion. */
  const flyTo = useCallback(
    (next: ZoomTransform) => {
      const svg = svgRef.current;
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
        setCommittedK(zoomTransform(svg).k);
      };
      anim.current = requestAnimationFrame(step);
    },
    [size.w, size.h],
  );
  useEffect(
    () => () => {
      if (anim.current !== null) cancelAnimationFrame(anim.current);
    },
    [],
  );

  const zoomBy = useCallback(
    (factor: number) => {
      const svg = svgRef.current;
      if (!svg) return;
      userMoved.current = true;
      const cur = zoomTransform(svg);
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
    const svg = svgRef.current;
    if (!svg || !zoomRef.current || userMoved.current) return;
    const cur = zoomTransform(svg);
    if (cur.k === home.k && cur.x === home.x && cur.y === home.y) return;
    select(svg).call(zoomRef.current.transform, home);
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
    const d = drawn.find((x) => x.id === highlightId);
    const a = anchors.get(highlightId);
    if (!d || !a) return;
    const need = (HIGHLIGHT_FILL * Math.min(size.w, size.h)) / Math.max(d.base, 0.5);
    if (need > 1.5) zoomTo(a[0], a[1], need);
  }, [highlightId, mode]);

  const rel = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = svgRef.current?.getBoundingClientRect();
    return [e.clientX - (r?.left ?? 0), e.clientY - (r?.top ?? 0)];
  };

  const choose = useCallback(
    (sx: number, sy: number, allowLoupe: boolean) => {
      if (mode === "free-pin") {
        const [bx, by] = screenToBase(t, sx, sy);
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
    [mode, t, projection, rings, polygonAt, pointerKind, onPinChange, onSelect],
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
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (!tracksHover || e.pointerType === "touch" || down.current) return;
    const [sx, sy] = rel(e);
    const id = ringAt(rings, sx, sy)?.id ?? polygonAt(sx, sy) ?? null;
    if (id !== hovered.current) {
      hovered.current = id;
      setHoverId(id);
      onHover?.(id);
    }
  };
  const onPointerLeave = () => {
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
        <g transform={`translate(${t.x} ${t.y}) scale(${t.k})`}>
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
