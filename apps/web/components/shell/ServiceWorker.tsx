"use client";

import { useEffect } from "react";

const WARMED = "meridian:sw-warmed";

/**
 * Registers the service worker in production (T2.4) and asks it, once per release, to fetch the game routes and packs
 * while the connection is good. Nothing here blocks the page and every failure is silent: offline support is a bonus.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    let cancelled = false;
    const start = async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        const ready = await navigator.serviceWorker.ready;
        if (cancelled || !navigator.onLine) return;
        const stamp = `${reg.scope}|${process.env["NEXT_PUBLIC_BUILD_ID"] ?? "1"}`;
        let done = false;
        try {
          done = window.localStorage.getItem(WARMED) === stamp;
        } catch {
          /* storage blocked: warm again next time */
        }
        if (done) return;
        // Loaded on demand: the quiz list is not part of the shell bundle.
        const { LIBRARY } = await import("../../lib/quiz/library");
        ready.active?.postMessage({
          type: "warm",
          routes: [
            ...LIBRARY.map((q) => `/play/quiz/${q.slug}`),
            "/play/subdivisions",
            "/play/subdivisions/usa",
          ],
        });
        try {
          window.localStorage.setItem(WARMED, stamp);
        } catch {
          /* ignore */
        }
      } catch {
        /* registration failed: the site works online as before */
      }
    };
    const idle = (window as unknown as { requestIdleCallback?: (f: () => void) => number })
      .requestIdleCallback;
    if (idle) idle(() => void start());
    else setTimeout(() => void start(), 2000);
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
