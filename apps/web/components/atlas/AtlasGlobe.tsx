"use client";

import {
  geoBounds,
  geoCentroid,
  geoContains,
  geoDistance,
  geoGraticule10,
  geoInterpolate,
  geoOrthographic,
  geoPath,
  type GeoPermissibleObjects,
} from "d3-geo";
import { useEffect, useRef } from "react";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";

type Country = {
  id: string;
  geometry: GeoPermissibleObjects;
  centroid: [number, number];
  /** Diagonal of the bounding box in degrees: how far to zoom in when flying to it. */
  extent: number;
};

export type AtlasGlobeProps = {
  topology: Topology;
  /** Fill per place id (the layer's colour); places without one get the plain land colour. */
  fills: ReadonlyMap<string, string>;
  dimmed?: ReadonlySet<string> | undefined;
  selected: string | null;
  compare: readonly string[];
  names: ReadonlyMap<string, string>;
  label: string;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
};

const TILT = -16;
const IDLE_SPIN = 0.004; // degrees per ms
const MIN_K = 1;
const MAX_K = 8;
const FLY_MS = 1100;

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * The Atlas globe (UX_AND_DESIGN §5.6): a live orthographic Earth on a canvas. Countries are filled with the current
 * layer's colours; drag spins it (with inertia), the wheel or a pinch zooms, a click opens a place, and choosing a
 * place flies the globe to it, lights it up and labels it. It spins slowly while idle. Reduced motion: no idle spin
 * and no flight, every change is drawn at once. Keyboard: arrows spin, + and − zoom; places are chosen with the
 * search or the flat Map view, which keeps full keyboard navigation.
 */
export default function AtlasGlobe(props: AtlasGlobeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The latest props, read by the render loop without restarting it.
  const live = useRef(props);
  live.current = props;
  const api = useRef<{ redraw: () => void; flyTo: (id: string) => void } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const object = (props.topology.objects["countries"] ??
      Object.values(props.topology.objects)[0]) as GeometryCollection | undefined;
    if (!object) return;
    const fc = feature(props.topology, object) as unknown as {
      features: { id?: string | number; geometry: GeoPermissibleObjects | null }[];
    };
    const countries: Country[] = fc.features.flatMap((f) => {
      if (f.id === undefined || !f.geometry) return [];
      const [[x0, y0], [x1, y1]] = geoBounds(f.geometry as never);
      const w = x1 >= x0 ? x1 - x0 : x1 + 360 - x0;
      return [
        {
          id: String(f.id),
          geometry: f.geometry,
          centroid: geoCentroid(f.geometry as never) as [number, number],
          extent: Math.hypot(w, y1 - y0),
        },
      ];
    });
    const byId = new Map(countries.map((c) => [c.id, c]));
    const graticule = geoGraticule10();
    const projection = geoOrthographic().clipAngle(90).precision(0.5);
    const path = geoPath(projection, ctx);
    const reduce =
      document.documentElement.dataset["motion"] === "reduce" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let size = { w: 0, h: 0 };
    let dpr = 1;
    let base = 1; // radius at k = 1
    let lambda = -10;
    let phi = TILT;
    let k = 1;
    let vLambda = 0;
    let lastInteraction = 0;
    let hover: string | null = null;
    let raf = 0;
    let prev = 0;
    let visible = true;
    let flight: {
      from: [number, number];
      to: [number, number];
      k0: number;
      k1: number;
      start: number;
    } | null = null;
    const pointers = new Map<number, { x: number; y: number }>();
    let downAt: { x: number; y: number } | null = null;
    let moved = 0;
    let pinch0: { d: number; k: number } | null = null;

    const radius = () => base * k;
    const centre = (): [number, number] => [-lambda, -phi];

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return;
      dpr = Math.min(window.devicePixelRatio || 1, r.width > 900 ? 1.5 : 2);
      size = { w: r.width, h: r.height };
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      base = Math.min(r.width, r.height) * 0.43;
    };

    const draw = (now: number) => {
      const { w, h } = size;
      if (!w) return;
      const p = live.current;
      const r = radius();
      const cx = w / 2;
      const cy = h / 2;
      projection.translate([cx, cy]).scale(r).rotate([lambda, phi]);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // Atmosphere: a soft blue-violet halo just outside the limb.
      const halo = ctx.createRadialGradient(cx, cy, r * 0.96, cx, cy, r * 1.22);
      halo.addColorStop(0, "rgba(120,150,255,0.55)");
      halo.addColorStop(0.25, "rgba(110,90,255,0.22)");
      halo.addColorStop(1, "rgba(80,60,255,0)");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.22, 0, Math.PI * 2);
      ctx.fill();

      // Ocean, lit from the upper left.
      const ocean = ctx.createRadialGradient(cx - r * 0.4, cy - r * 0.45, r * 0.05, cx, cy, r);
      ocean.addColorStop(0, "#1d3d86");
      ocean.addColorStop(0.45, "#0f2457");
      ocean.addColorStop(1, "#071332");
      ctx.beginPath();
      path({ type: "Sphere" });
      ctx.fillStyle = ocean;
      ctx.fill();

      ctx.beginPath();
      path(graticule);
      ctx.strokeStyle = "rgba(150,180,255,0.12)";
      ctx.lineWidth = 0.6;
      ctx.stroke();

      // Countries, each in its layer colour.
      const front = (c: Country) => geoDistance(c.centroid, centre()) < Math.PI / 2 + 0.6;
      for (const c of countries) {
        if (!front(c)) continue;
        const dim = p.dimmed?.has(c.id);
        ctx.beginPath();
        path(c.geometry);
        ctx.fillStyle = dim ? "#2a2f45" : (p.fills.get(c.id) ?? "#3b4a7a");
        ctx.globalAlpha = dim ? 0.55 : 1;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.beginPath();
      for (const c of countries) if (front(c)) path(c.geometry);
      ctx.strokeStyle = "rgba(10,14,30,0.55)";
      ctx.lineWidth = 0.7;
      ctx.stroke();

      // Hover: a light veil and a crisp outline.
      const hc = hover ? byId.get(hover) : undefined;
      if (hc && hc.id !== p.selected) {
        ctx.beginPath();
        path(hc.geometry);
        ctx.fillStyle = "rgba(255,255,255,0.22)";
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      // Compare: dashed outlines.
      for (const id of p.compare) {
        const c = byId.get(id);
        if (!c || id === p.selected) continue;
        ctx.save();
        ctx.beginPath();
        path(c.geometry);
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.restore();
      }

      // Limb darkening and a specular highlight make the disc read as a sphere.
      const limb = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, r);
      limb.addColorStop(0, "rgba(0,0,0,0)");
      limb.addColorStop(1, "rgba(2,6,20,0.5)");
      ctx.beginPath();
      path({ type: "Sphere" });
      ctx.fillStyle = limb;
      ctx.fill();
      const spec = ctx.createRadialGradient(
        cx - r * 0.45,
        cy - r * 0.5,
        0,
        cx - r * 0.45,
        cy - r * 0.5,
        r * 0.9,
      );
      spec.addColorStop(0, "rgba(255,255,255,0.16)");
      spec.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = spec;
      ctx.fill();

      // The selected place glows, pulses and carries its name.
      const sc = p.selected ? byId.get(p.selected) : undefined;
      if (sc) {
        ctx.save();
        ctx.beginPath();
        path(sc.geometry);
        ctx.fillStyle = "#b8a4ff";
        ctx.shadowColor = "#a48bff";
        ctx.shadowBlur = 24;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.6;
        ctx.stroke();
        ctx.restore();
        const xy = projection(sc.centroid);
        if (xy && geoDistance(sc.centroid, centre()) < Math.PI / 2 - 0.05) {
          const pulse = reduce ? 0.4 : (now % 1600) / 1600;
          ctx.beginPath();
          ctx.arc(xy[0], xy[1], 6 + pulse * 22, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255,255,255,${(1 - pulse) * 0.8})`;
          ctx.lineWidth = 1.5;
          ctx.stroke();
          const name = p.names.get(sc.id) ?? "";
          ctx.font = "700 14px 'Inter Variable', Inter, system-ui, sans-serif";
          const tw = ctx.measureText(name).width;
          const lx = xy[0] - tw / 2 - 12;
          const ly = xy[1] - 44;
          ctx.fillStyle = "rgba(10,11,30,0.85)";
          ctx.beginPath();
          ctx.roundRect(lx, ly, tw + 24, 28, 14);
          ctx.fill();
          ctx.strokeStyle = "rgba(255,255,255,0.25)";
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.fillStyle = "#f5f5f7";
          ctx.fillText(name, lx + 12, ly + 19);
          ctx.beginPath();
          ctx.moveTo(xy[0], ly + 28);
          ctx.lineTo(xy[0], xy[1] - 6);
          ctx.strokeStyle = "rgba(255,255,255,0.6)";
          ctx.stroke();
        }
      }

      ctx.beginPath();
      path({ type: "Sphere" });
      ctx.strokeStyle = "rgba(150,170,255,0.5)";
      ctx.lineWidth = 1;
      ctx.stroke();
    };

    const tick = (now: number) => {
      raf = 0;
      const dt = prev ? Math.min(64, now - prev) : 16;
      prev = now;
      if (flight) {
        const t = clamp((now - flight.start) / FLY_MS, 0, 1);
        const e = ease(t);
        const at = geoInterpolate(flight.from, flight.to)(e);
        lambda = -at[0];
        phi = -at[1];
        // Pull back a little mid-flight, like a camera hop.
        k = flight.k0 + (flight.k1 - flight.k0) * e - Math.sin(Math.PI * e) * 0.25 * flight.k0;
        if (t >= 1) flight = null;
      } else if (pointers.size === 0) {
        lambda += vLambda * dt;
        vLambda *= 0.94;
        const idle = !live.current.selected && now - lastInteraction > 2500;
        if (idle && !reduce) lambda += IDLE_SPIN * dt;
      }
      draw(now);
      schedule();
    };
    // The globe is alive while on screen (idle spin, the selection's pulse); never with reduced motion.
    const animating = () => !reduce;
    const schedule = () => {
      if (!raf && visible && !document.hidden && animating()) raf = requestAnimationFrame(tick);
    };
    const redraw = () => {
      if (reduce) draw(performance.now());
      else schedule();
    };

    const pick = (x: number, y: number): string | null => {
      const r = canvas.getBoundingClientRect();
      const px = x - r.left;
      const py = y - r.top;
      if (Math.hypot(px - size.w / 2, py - size.h / 2) > radius()) return null;
      const ll = projection.invert?.([px, py]);
      if (!ll) return null;
      for (const c of countries)
        if (geoDistance(c.centroid, ll) < 0.9 && geoContains(c.geometry as never, ll)) return c.id;
      for (const c of countries) if (geoContains(c.geometry as never, ll)) return c.id;
      return null;
    };

    const flyTo = (id: string) => {
      const c = byId.get(id);
      if (!c) return;
      const k1 = clamp(42 / Math.max(c.extent, 4), 1.25, 3.2);
      const to: [number, number] = [c.centroid[0], clamp(c.centroid[1], -60, 60)];
      if (reduce) {
        lambda = -to[0];
        phi = -to[1];
        k = k1;
        draw(performance.now());
        return;
      }
      flight = { from: centre(), to, k0: k, k1, start: performance.now() };
      schedule();
    };
    api.current = { redraw, flyTo };

    const onDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      flight = null;
      lastInteraction = performance.now();
      if (pointers.size === 1) {
        downAt = { x: e.clientX, y: e.clientY };
        moved = 0;
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()] as [
          { x: number; y: number },
          { x: number; y: number },
        ];
        pinch0 = { d: Math.hypot(a.x - b.x, a.y - b.y), k };
      }
    };
    const onMove = (e: PointerEvent) => {
      const before = pointers.get(e.pointerId);
      if (!before) {
        if (e.pointerType === "mouse") {
          const id = pick(e.clientX, e.clientY);
          if (id !== hover) {
            hover = id;
            canvas.style.cursor = id ? "pointer" : "grab";
            live.current.onHover(id);
            redraw();
          }
        }
        return;
      }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      lastInteraction = performance.now();
      if (pointers.size === 2 && pinch0) {
        const [a, b] = [...pointers.values()] as [
          { x: number; y: number },
          { x: number; y: number },
        ];
        k = clamp((pinch0.k * Math.hypot(a.x - b.x, a.y - b.y)) / pinch0.d, MIN_K, MAX_K);
        moved = 99;
        redraw();
        return;
      }
      const dx = e.clientX - before.x;
      const dy = e.clientY - before.y;
      moved += Math.abs(dx) + Math.abs(dy);
      const deg = 180 / (Math.PI * radius());
      lambda += dx * deg;
      phi = clamp(phi - dy * deg, -80, 80);
      vLambda = (dx * deg) / 16;
      redraw();
    };
    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch0 = null;
      if (pointers.size === 0 && downAt && moved < 6) {
        vLambda = 0;
        const id = pick(e.clientX, e.clientY);
        if (id) live.current.onSelect(id);
      }
      if (pointers.size === 0) downAt = null;
      lastInteraction = performance.now();
    };
    const onLeave = () => {
      if (hover) {
        hover = null;
        live.current.onHover(null);
        redraw();
      }
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      flight = null;
      lastInteraction = performance.now();
      k = clamp(k * Math.exp(-e.deltaY * 0.0015), MIN_K, MAX_K);
      redraw();
    };
    const onKey = (e: KeyboardEvent) => {
      const step = 12 / k;
      if (e.key === "ArrowLeft") lambda += step;
      else if (e.key === "ArrowRight") lambda -= step;
      else if (e.key === "ArrowUp") phi = clamp(phi + step, -80, 80);
      else if (e.key === "ArrowDown") phi = clamp(phi - step, -80, 80);
      else if (e.key === "+" || e.key === "=") k = clamp(k * 1.25, MIN_K, MAX_K);
      else if (e.key === "-" || e.key === "_") k = clamp(k / 1.25, MIN_K, MAX_K);
      else return;
      e.preventDefault();
      flight = null;
      lastInteraction = performance.now();
      if (reduce) draw(performance.now());
      else schedule();
    };

    const ro =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            resize();
            draw(performance.now());
          });
    ro?.observe(canvas);
    const io =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(([en]) => {
            visible = !!en?.isIntersecting;
            prev = 0;
            schedule();
          });
    io?.observe(canvas);
    const onVis = () => {
      prev = 0;
      schedule();
    };
    document.addEventListener("visibilitychange", onVis);
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("keydown", onKey);

    resize();
    const first = live.current.selected;
    if (first) {
      const c = byId.get(first);
      if (c) {
        lambda = -c.centroid[0];
        phi = -clamp(c.centroid[1], -60, 60);
        k = clamp(42 / Math.max(c.extent, 4), 1.25, 3.2);
      }
    }
    draw(performance.now());
    schedule();

    return () => {
      api.current = null;
      if (raf) cancelAnimationFrame(raf);
      ro?.disconnect();
      io?.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("keydown", onKey);
    };
    // The topology is the only thing that rebuilds the scene; everything else is read live.
  }, [props.topology]);

  // A new selection flies there; any other change just redraws.
  const selected = props.selected;
  useEffect(() => {
    if (selected) api.current?.flyTo(selected);
  }, [selected]);
  useEffect(() => {
    api.current?.redraw();
  }, [props.fills, props.dimmed, props.compare]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      tabIndex={0}
      aria-label={props.label}
      className="atlas-globe-canvas"
    />
  );
}
