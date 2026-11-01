"use client";

import { useCallback, useEffect, useState, type ComponentType } from "react";
import type { Topology } from "topojson-specification";
import { t } from "../../lib/i18n";
import { useServices } from "../shell/StorageProvider";
import styles from "./home.module.css";

type GlobeProps = { topology: Topology; onReady?: () => void };

/** Static graticule globe: the first paint, and the fallback when the live globe can't load. */
function StillGlobe() {
  const lat = [-60, -30, 0, 30, 60].map((d) => {
    const y = 50 - (d / 90) * 46;
    const rx = Math.sqrt(Math.max(0, 46 * 46 - (y - 50) * (y - 50)));
    return <ellipse key={d} cx="50" cy={y} rx={rx} ry={rx * 0.14} />;
  });
  const lon = [0, 25, 50, 75, 100, 125, 150].map((d) => (
    <ellipse key={d} cx="50" cy="50" rx={46 * Math.abs(Math.cos((d * Math.PI) / 180))} ry="46" />
  ));
  return (
    <svg viewBox="0 0 100 100" className={styles.globeStill} focusable="false">
      <circle cx="50" cy="50" r="46" fill="var(--color-ocean)" />
      <g fill="none" stroke="var(--color-border-map)" strokeWidth="0.35" opacity="0.6">
        {lat}
        {lon}
      </g>
      <circle
        cx="50"
        cy="50"
        r="46"
        fill="none"
        stroke="var(--color-border-map)"
        strokeWidth="0.5"
      />
    </svg>
  );
}

/**
 * Home hero globe. Paints a still globe immediately, then (after the page is idle) loads the 110m world pack and
 * the canvas renderer as a separate chunk, so neither counts against the Home JS budget. Decorative: hidden from
 * assistive tech.
 */
export function HeroGlobe() {
  const services = useServices();
  const [live, setLive] = useState<{ Globe: ComponentType<GlobeProps>; topology: Topology } | null>(
    null,
  );
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);

  useEffect(() => {
    if (!services) return;
    let alive = true;
    const start = () => {
      void Promise.all([import("./GlobeCanvas"), services.loader.pack<Topology>("geo.world.110m")])
        .then(([mod, topology]) => {
          if (alive) setLive({ Globe: mod.default, topology });
        })
        .catch(() => {
          /* the still globe stays */
        });
    };
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number })
      .requestIdleCallback;
    if (idle) idle(start);
    else setTimeout(start, 200);
    return () => {
      alive = false;
    };
  }, [services]);

  return (
    <div className={styles.globe} data-ready={ready ? "" : undefined} aria-hidden="true">
      <div className={styles.globeHalo} />
      <StillGlobe />
      {live && <live.Globe topology={live.topology} onReady={onReady} />}
      <p className={styles.globeHint}>{t("home.globeHint")}</p>
    </div>
  );
}
