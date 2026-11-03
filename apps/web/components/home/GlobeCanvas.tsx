"use client";

import {
  geoCentroid,
  geoDistance,
  geoGraticule10,
  geoInterpolate,
  geoOrthographic,
  geoPath,
  type GeoPermissibleObjects,
} from "d3-geo";
import { useEffect, useRef } from "react";
import { feature, mesh } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";

type Country = { id: string; geometry: GeoPermissibleObjects; centroid: [number, number] };
type Palette = {
  ocean: string;
  oceanHi: string;
  land: string;
  border: string;
  accent: string;
  text: string;
  surface: string;
};

const TILT = -18;
const SPIN_DEG_PER_MS = 0.006;
const ROUTE_MS = 2600;
const HOLD_MS = 1400;

/**
 * Colours come from the canvas's own computed style, so a scene can restyle the globe: `--globe-*` variables on an
 * ancestor win over the theme tokens (the Home hero paints a night Earth this way).
 */
function readPalette(el: Element): Palette {
  const cs = getComputedStyle(el);
  const v = (name: string, fallback: string) =>
    cs.getPropertyValue(name).trim() || cs.getPropertyValue(fallback).trim() || "#888";
  return {
    ocean: v("--globe-ocean", "--color-ocean"),
    oceanHi: v("--globe-ocean-hi", "--color-surface"),
    land: v("--globe-land", "--color-land"),
    border: v("--globe-border", "--color-border-map"),
    accent: v("--globe-accent", "--color-accent"),
    text: v("--globe-text", "--color-text"),
    surface: v("--globe-surface", "--color-surface"),
  };
}

/** Eases a 0..1 progress value (cubic in-out). */
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * The home hero globe: an orthographic world from the 110m geometry pack that spins slowly, can be dragged, and
 * flies a route between two countries in view every few seconds, lighting up the destination. Decorative only
 * (the caller marks it aria-hidden). Pauses off screen and in hidden tabs; draws one still frame for reduced motion.
 */
export default function GlobeCanvas({
  topology,
  onReady,
}: {
  topology: Topology;
  onReady?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const object = topology.objects["countries"] as GeometryCollection | undefined;
    if (!object) return;
    const fc = feature(topology, object) as unknown as {
      features: { id?: string | number; geometry: GeoPermissibleObjects | null }[];
    };
    const countries: Country[] = fc.features.flatMap((f) =>
      f.id !== undefined && f.geometry
        ? [
            {
              id: String(f.id),
              geometry: f.geometry,
              centroid: geoCentroid(f.geometry as never) as [number, number],
            },
          ]
        : [],
    );
    const borders = mesh(topology, object, (a, b) => a !== b);
    const graticule = geoGraticule10();
    const projection = geoOrthographic().clipAngle(90).precision(0.6);
    const path = geoPath(projection, ctx);

    const reduce =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      document.documentElement.dataset.motion === "reduce";

    let palette = readPalette(canvas);
    let size = 0;
    let dpr = 1;
    let lambda = -20;
    let phi = TILT;
    let velocity = SPIN_DEG_PER_MS;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let visible = true;
    let raf = 0;
    let prev = 0;
    let routeStart = 0;
    let route: { a: Country; b: Country; interp: (t: number) => [number, number] } | null = null;
    let readySent = false;

    const centre = (): [number, number] => [-lambda, -phi];

    const pickRoute = (now: number) => {
      const c = centre();
      const front = countries.filter((k) => geoDistance(k.centroid, c) < 1.0);
      if (front.length < 2) {
        route = null;
        return;
      }
      for (let tries = 0; tries < 12; tries++) {
        const a = front[Math.floor(Math.random() * front.length)]!;
        const b = front[Math.floor(Math.random() * front.length)]!;
        const d = geoDistance(a.centroid, b.centroid);
        if (a !== b && d > 0.35 && d < 1.4) {
          route = { a, b, interp: geoInterpolate(a.centroid, b.centroid) };
          routeStart = now;
          return;
        }
      }
      route = null;
    };

    const resize = () => {
      const w = canvas.clientWidth;
      if (!w) return;
      // A big globe is costly to fill every frame: cap its pixel ratio lower.
      dpr = Math.min(window.devicePixelRatio || 1, w > 640 ? 1.5 : 2);
      size = w;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(w * dpr);
      projection.translate([w / 2, w / 2]).scale(w / 2 - 6);
    };

    const isFront = (p: [number, number]) => geoDistance(p, centre()) < Math.PI / 2 - 0.05;

    const dot = (p: [number, number], r: number, fill: string, alpha = 1) => {
      const xy = projection(p);
      if (!xy || !isFront(p)) return;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(xy[0], xy[1], r, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.globalAlpha = 1;
    };

    const ring = (p: [number, number], r: number, alpha: number) => {
      const xy = projection(p);
      if (!xy || !isFront(p)) return;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(xy[0], xy[1], r, 0, Math.PI * 2);
      ctx.strokeStyle = palette.accent;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.globalAlpha = 1;
    };

    const draw = (now: number) => {
      if (!size) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      projection.rotate([lambda, phi]);
      const r = size / 2 - 6;
      const cx = size / 2;

      // Ocean: lit from the upper left.
      const ocean = ctx.createRadialGradient(cx - r * 0.35, cx - r * 0.4, r * 0.1, cx, cx, r);
      ocean.addColorStop(0, palette.oceanHi);
      ocean.addColorStop(0.25, palette.ocean);
      ocean.addColorStop(1, palette.ocean);
      ctx.beginPath();
      path({ type: "Sphere" });
      ctx.fillStyle = ocean;
      ctx.fill();

      ctx.beginPath();
      path(graticule);
      ctx.strokeStyle = palette.border;
      ctx.globalAlpha = 0.28;
      ctx.lineWidth = 0.6;
      ctx.stroke();
      ctx.globalAlpha = 1;

      ctx.beginPath();
      for (const c of countries) path(c.geometry);
      ctx.fillStyle = palette.land;
      ctx.fill();

      // The destination of the current route lights up as the line arrives.
      let progress = 0;
      if (route) {
        const elapsed = now - routeStart;
        progress = Math.min(1, elapsed / ROUTE_MS);
        const glow = Math.max(0, Math.min(1, (elapsed - ROUTE_MS * 0.85) / 400));
        const fade = elapsed > ROUTE_MS + HOLD_MS ? 1 - (elapsed - ROUTE_MS - HOLD_MS) / 500 : 1;
        if (glow > 0) {
          ctx.beginPath();
          path(route.b.geometry);
          ctx.globalAlpha = 0.85 * glow * Math.max(0, fade);
          ctx.fillStyle = palette.accent;
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }

      ctx.beginPath();
      path(borders);
      ctx.strokeStyle = palette.border;
      ctx.globalAlpha = 0.75;
      ctx.lineWidth = 0.5;
      ctx.stroke();
      ctx.globalAlpha = 1;

      if (route) {
        const elapsed = now - routeStart;
        const fade = elapsed > ROUTE_MS + HOLD_MS ? 1 - (elapsed - ROUTE_MS - HOLD_MS) / 500 : 1;
        const p = ease(progress);
        const steps = 48;
        const coords: [number, number][] = [];
        for (let i = 0; i <= steps * p; i++) coords.push(route.interp(i / steps));
        coords.push(route.interp(p));
        ctx.save();
        ctx.globalAlpha = Math.max(0, fade);
        ctx.beginPath();
        path({ type: "LineString", coordinates: coords });
        ctx.strokeStyle = palette.accent;
        ctx.lineWidth = 2.25;
        ctx.lineCap = "round";
        ctx.shadowColor = palette.accent;
        ctx.shadowBlur = 10;
        ctx.stroke();
        ctx.restore();
        const fadeA = Math.max(0, fade);
        dot(route.a.centroid, 4, palette.accent, fadeA);
        dot(route.a.centroid, 1.8, palette.surface, fadeA);
        dot(route.interp(p), 3.2, palette.text, fadeA);
        const pulse = (now % 1400) / 1400;
        ring(route.a.centroid, 4 + pulse * 14, (1 - pulse) * 0.8 * fadeA);
        if (progress >= 1) {
          dot(route.b.centroid, 5, palette.accent, fadeA);
          dot(route.b.centroid, 2, palette.surface, fadeA);
          ring(route.b.centroid, 5 + pulse * 16, (1 - pulse) * 0.9 * fadeA);
        }
        if (elapsed > ROUTE_MS + HOLD_MS + 500) pickRoute(now);
      }

      // Limb darkening and a soft specular highlight make the disc read as a sphere.
      const limb = ctx.createRadialGradient(cx, cx, r * 0.55, cx, cx, r);
      limb.addColorStop(0, "rgba(0,0,0,0)");
      limb.addColorStop(1, "rgba(10,20,35,0.28)");
      ctx.beginPath();
      path({ type: "Sphere" });
      ctx.fillStyle = limb;
      ctx.fill();
      const spec = ctx.createRadialGradient(
        cx - r * 0.45,
        cx - r * 0.5,
        0,
        cx - r * 0.45,
        cx - r * 0.5,
        r * 0.8,
      );
      spec.addColorStop(0, "rgba(255,255,255,0.14)");
      spec.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = spec;
      ctx.fill();

      ctx.beginPath();
      path({ type: "Sphere" });
      ctx.strokeStyle = palette.border;
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.globalAlpha = 1;

      if (!readySent) {
        readySent = true;
        onReady?.();
      }
    };

    const tick = (now: number) => {
      raf = 0;
      const dt = prev ? Math.min(64, now - prev) : 16;
      prev = now;
      if (!dragging) {
        // Ease back to the steady spin after a flick.
        velocity += (SPIN_DEG_PER_MS - velocity) * 0.02;
        lambda += velocity * dt;
        phi += (TILT - phi) * 0.01;
      }
      if (!route) pickRoute(now);
      draw(now);
      schedule();
    };
    const schedule = () => {
      if (!raf && visible && !document.hidden && !reduce) raf = requestAnimationFrame(tick);
    };

    const onDown = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const k = 180 / Math.max(size, 1);
      const dx = (e.clientX - lastX) * k;
      lambda += dx;
      phi = Math.max(-60, Math.min(60, phi - (e.clientY - lastY) * k));
      velocity = dx / 16;
      lastX = e.clientX;
      lastY = e.clientY;
      if (reduce) draw(performance.now());
    };
    const onUp = () => {
      dragging = false;
    };

    const ro = new ResizeObserver(() => {
      resize();
      draw(performance.now());
    });
    ro.observe(canvas);
    const io = new IntersectionObserver(([entry]) => {
      visible = !!entry?.isIntersecting;
      schedule();
    });
    io.observe(canvas);
    const onVis = () => {
      prev = 0;
      schedule();
    };
    document.addEventListener("visibilitychange", onVis);
    const mo = new MutationObserver(() => {
      palette = readPalette(canvas);
      draw(performance.now());
    });
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "data-contrast"],
    });
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onScheme = () => {
      palette = readPalette(canvas);
      draw(performance.now());
    };
    mq.addEventListener("change", onScheme);
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);

    resize();
    pickRoute(performance.now());
    draw(performance.now());
    schedule();

    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      mo.disconnect();
      mq.removeEventListener("change", onScheme);
      document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
    };
  }, [topology, onReady]);

  return <canvas ref={canvasRef} className="hero-globe-canvas" />;
}
