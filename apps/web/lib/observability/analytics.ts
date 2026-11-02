/**
 * Product analytics with PostHog (owner decision, replaces Vercel Web Analytics in Q-08). It is:
 * - cookieless: `cookieless_mode: "always"` keeps nothing on the device; PostHog counts visitors with a daily-salted
 *   hash on its side, so no one is followed across days or sites;
 * - first-party: every request goes to `/ingest` on our own origin and is proxied (AC-PL-003), using the build that
 *   never loads extra scripts (the CSP stays strict);
 * - intentional: no autocapture and no session recording. Only page views and the events listed in `AnalyticsEvents`
 *   are sent, and none of them carries an answer, a name or anything typed;
 * - optional: on by default, off with Settings → "Share anonymous usage statistics" or the browser's Global Privacy
 *   Control signal. Off means the SDK is never loaded.
 */
import type { PostHog } from "posthog-js";

/** Every event Meridian sends, with its properties. Add an event here before using it. */
export type AnalyticsEvents = {
  round_finished: {
    game: string;
    mode: string;
    outcome: string;
    /** The score as a 10-point band ("70%"), never the exact score. */
    score_band: string;
    daily: boolean;
  };
  result_shared: { game: string; what: "daily" | "daily_bundle" | "challenge" | "run" };
  challenge_created: { game: string };
  challenge_opened: { game: string; short_code: boolean };
  report_sent: { category: string };
};

export const POSTHOG_PROXY = "/ingest";

let ph: PostHog | null = null;
let loading: Promise<void> | null = null;
let wanted = false;
const queue: { name: string; props: Record<string, unknown> }[] = [];
const MAX_QUEUE = 50;

const key = (): string | undefined => process.env["NEXT_PUBLIC_POSTHOG_KEY"] || undefined;
const uiHost = (): string =>
  process.env["NEXT_PUBLIC_POSTHOG_REGION"] === "eu"
    ? "https://eu.posthog.com"
    : "https://us.posthog.com";

/** The browser's Global Privacy Control signal: when on, analytics stay off whatever the setting says. */
export const gpcOn = (nav: unknown = globalThis.navigator): boolean =>
  (nav as { globalPrivacyControl?: boolean } | undefined)?.globalPrivacyControl === true;

export const analyticsConfigured = (): boolean => Boolean(key());

/** Turns analytics on or off for this page, from the saved setting. Safe to call repeatedly. */
export function setAnalyticsEnabled(on: boolean): void {
  wanted = on && analyticsConfigured() && !gpcOn();
  // Lets the shell switch page-speed measurement with the same setting.
  if (typeof window !== "undefined")
    window.dispatchEvent(new CustomEvent("meridian:analytics", { detail: on }));
  if (!wanted) {
    queue.length = 0;
    if (ph) ph.opt_out_capturing();
    return;
  }
  if (ph) {
    ph.opt_in_capturing();
    return;
  }
  loading ??= import("posthog-js/no-external")
    .then(({ default: posthog }) => {
      posthog.init(key()!, {
        api_host: POSTHOG_PROXY,
        ui_host: uiHost(),
        cookieless_mode: "always",
        persistence: "memory",
        disable_external_dependency_loading: true,
        autocapture: false,
        capture_pageview: "history_change",
        capture_pageleave: true,
        capture_exceptions: false,
        capture_performance: false,
        disable_session_recording: true,
        disable_surveys: true,
        advanced_disable_flags: true,
        person_profiles: "identified_only",
      });
      ph = posthog;
      if (!wanted) {
        posthog.opt_out_capturing();
        return;
      }
      for (const e of queue.splice(0)) posthog.capture(e.name, e.props);
    })
    .catch(() => {
      loading = null;
    });
}

/** Sends one product event (queued until the SDK has loaded; dropped when analytics are off). */
export function track<N extends keyof AnalyticsEvents>(name: N, props: AnalyticsEvents[N]): void {
  if (!wanted) return;
  if (ph) ph.capture(name, props);
  else if (queue.length < MAX_QUEUE) queue.push({ name, props });
}

/** 0–100 into a 10-point band, so analytics never hold an exact score. */
export const scoreBand = (score: number, max: number): string =>
  max > 0 ? `${Math.min(100, Math.floor((100 * score) / max / 10) * 10)}%` : "n/a";
