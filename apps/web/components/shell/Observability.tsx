"use client";

import { useEffect, useState } from "react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { useServices } from "./StorageProvider";
import { loadSettings } from "../../lib/settings/settings";
import {
  installEarlyErrorBuffer,
  startErrorReporting,
} from "../../lib/observability/errors-client";
import {
  analyticsConfigured,
  gpcOn,
  scoreBand,
  setAnalyticsEnabled,
  track,
} from "../../lib/observability/analytics";

/** Speed Insights reports from Vercel deployments only: elsewhere its script does not exist. */
const ON_VERCEL = Boolean(process.env["NEXT_PUBLIC_VERCEL_ENV"]);

/** After the page is interactive, so none of this weighs on the first paint (ARCHITECTURE §13). */
const whenIdle = (fn: () => void): (() => void) => {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(fn, { timeout: 3000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(fn, 1500);
  return () => window.clearTimeout(id);
};

/**
 * Error reporting (Sentry), usage statistics (PostHog) and real-user page speed (Vercel Speed Insights), each off
 * unless configured. Usage statistics and page speed also follow Settings and the Global Privacy Control signal.
 */
export function Observability() {
  const services = useServices();
  const [measure, setMeasure] = useState(false);

  useEffect(() => {
    installEarlyErrorBuffer();
    return whenIdle(() => void startErrorReporting());
  }, []);

  useEffect(() => {
    if (!services) return;
    let live = true;
    const cancel = whenIdle(() => {
      void loadSettings(services.db).then((s) => {
        if (!live) return;
        const on = s.analytics && !gpcOn();
        setAnalyticsEnabled(on);
        setMeasure(on);
      });
    });
    // Settings can switch statistics off without a reload.
    const onChange = (e: Event) => setMeasure((e as CustomEvent<boolean>).detail && !gpcOn());
    window.addEventListener("meridian:analytics", onChange);

    // One "round finished" event per result as it is stored, for every game. An import of old results stays silent.
    const onResult = (_key: unknown, obj: { data?: unknown; ended_at?: string }) => {
      if (!analyticsConfigured() || Date.now() - Date.parse(obj.ended_at ?? "") > 10_000) return;
      const r = obj.data as {
        game_id?: string;
        mode?: string;
        outcome?: string;
        score?: number;
        max_score?: number;
        daily_date?: string;
      } | null;
      if (!r?.game_id) return;
      track("round_finished", {
        game: r.game_id,
        mode: r.mode ?? "unknown",
        outcome: r.outcome ?? "unknown",
        score_band: scoreBand(r.score ?? 0, r.max_score ?? 0),
        daily: Boolean(r.daily_date),
      });
    };
    services.db.results.hook("creating", onResult as never);
    return () => {
      live = false;
      cancel();
      window.removeEventListener("meridian:analytics", onChange);
      services.db.results.hook("creating").unsubscribe(onResult as never);
    };
  }, [services]);

  return measure && ON_VERCEL ? <SpeedInsights /> : null;
}
