"use client";

import { useEffect } from "react";
import { gameResult } from "@meridian/schemas";
import { loadSettings } from "../../lib/settings/settings";
import { TelemetryClient, FLUSH_MS, browserSender } from "../../lib/telemetry/client";
import { eventsFromResult } from "../../lib/telemetry/events";
import { useServices } from "./StorageProvider";

/**
 * Sends anonymous answer statistics, only when the player has turned them on in Settings (off by default). It sees each
 * finished round as it is stored, queues the per-item outcomes and flushes them in batches.
 */
export function TelemetryWatcher() {
  const services = useServices();
  useEffect(() => {
    if (!services) return;
    const { db } = services;
    const client = new TelemetryClient(
      async () => (await loadSettings(db)).telemetry,
      browserSender,
    );
    const onCreate = (
      _key: unknown,
      obj: { data: unknown },
      trans: { on: (e: string, f: () => void) => void },
    ) => {
      trans.on("complete", () => {
        const parsed = gameResult.safeParse(obj.data);
        if (parsed.success)
          void client.enqueue(parsed.data.content_version, eventsFromResult(parsed.data));
      });
    };
    db.results.hook("creating", onCreate as never);
    const timer = setInterval(() => void client.flush(), FLUSH_MS);
    const hide = () => {
      if (document.visibilityState === "hidden") void client.flush();
    };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", hide);
    return () => {
      db.results.hook("creating").unsubscribe(onCreate as never);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", hide);
    };
  }, [services]);
  return null;
}
