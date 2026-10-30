"use client";

import { geoPath } from "d3-geo";
import { select } from "d3-selection";
import { zoom as d3zoom, zoomIdentity, type D3ZoomEvent, type ZoomBehavior } from "d3-zoom";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import type { Topology } from "topojson-specification";
import { Button } from "../components/Button";
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
};

export type GameMapProps = {
  /** Loaded geometry packs by level of detail. Missing levels are requested through `onNeedLod`. */
  lods: Partial<Record<Lod, Topology>>;
  entities: readonly MapEntity[];
  states?: Readonly<Record<string, MapFeatureState>>;
  mode: MapMode;
  onSelect?: (id: string) => void;
  pin?: Pin | null;
  onPinChange?: (pin: Pin) => void;
  onNeedLod?: (lod: Lod) => void;
  "aria-label": string;
  labels: GameMapLabels;
  /** Overrides pointer detection (tests, accessibility settings). */
  pointer?: PointerKind;
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
  mode,
  onSelect,
  pin = null,
  onPinChange,
  onNeedLod,
  labels,
  pointer,
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
  const down = useRef<{ x: number; y: number } | null>(null);

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
      .on("zoom", (e: D3ZoomEvent<SVGSVGElement, unknown>) =>
        setT({ k: e.transform.k, x: e.transform.x, y: e.transform.y }),
      )
      .on("end", (e: D3ZoomEvent<SVGSVGElement, unknown>) => setCommittedK(e.transform.k));
    zoomRef.current = behavior;
    select(svg).call(behavior);
    return () => {
      select(svg).on(".zoom", null);
    };
  }, [size.w, size.h]);

  const zoomBy = useCallback((factor: number) => {
    const svg = svgRef.current;
    if (svg && zoomRef.current) select(svg).call(zoomRef.current.scaleBy, factor);
  }, []);
  const zoomReset = useCallback(() => {
    const svg = svgRef.current;
    if (svg && zoomRef.current) select(svg).call(zoomRef.current.transform, zoomIdentity);
  }, []);
  const zoomTo = useCallback(
    (bx: number, by: number, k: number) => {
      const svg = svgRef.current;
      if (!svg || !zoomRef.current) return;
      const kk = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k));
      select(svg).call(
        zoomRef.current.transform,
        zoomIdentity.translate(size.w / 2 - kk * bx, size.h / 2 - kk * by).scale(kk),
      );
    },
    [size.w, size.h],
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

  const drawFeatures = (keyPrefix: string) =>
    ordered.map((d) => {
      const s = states[d.id] ?? "idle";
      const fill = fillFor(s);
      return (
        <path
          key={`${keyPrefix}${d.id}`}
          data-id={d.id}
          d={d.d}
          className={cx(
            styles.land,
            stateClass(s),
            activeId === d.id && !keyPrefix && styles.active,
          )}
          {...(fill ? { fill } : {})}
        />
      );
    });

  return (
    <div
      ref={rootRef}
      className={cx(styles.root, className)}
      data-mode={mode}
      data-lod={lod ?? ""}
      data-zoom={t.k.toFixed(2)}
      data-pointer={pointerKind}
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
        onKeyDown={onKeyDown}
      >
        <Patterns ids={patternIds} />
        <rect width={size.w} height={size.h} className={styles.sphere} />
        <g transform={`translate(${t.x} ${t.y}) scale(${t.k})`}>
          <path d={path({ type: "Sphere" }) ?? ""} className={styles.sphere} />
          {drawFeatures("")}
        </g>
        {rings.map((r) => (
          <circle
            key={r.id}
            cx={r.cx}
            cy={r.cy}
            r={r.r}
            className={cx(styles.ring, states[r.id] === "highlight" && styles.ringHighlight)}
            data-ring={r.id}
          />
        ))}
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
                {rings.map((r) => (
                  <circle
                    key={`loupe-${r.id}`}
                    cx={r.cx}
                    cy={r.cy}
                    r={r.r}
                    className={styles.ring}
                  />
                ))}
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
        <Button
          className={styles.zoomButton ?? ""}
          aria-label={labels.zoomIn}
          onPress={() => zoomBy(1.5)}
        >
          <span aria-hidden="true">+</span>
        </Button>
        <Button
          className={styles.zoomButton ?? ""}
          aria-label={labels.zoomOut}
          onPress={() => zoomBy(1 / 1.5)}
        >
          <span aria-hidden="true">−</span>
        </Button>
        <Button
          className={styles.zoomButton ?? ""}
          aria-label={labels.zoomReset}
          onPress={zoomReset}
        >
          <span aria-hidden="true">⌂</span>
        </Button>
      </div>
      <p className="visually-hidden" aria-live="polite">
        {announce}
      </p>
    </div>
  );
}
