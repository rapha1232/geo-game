"use client";

import { useEffect } from "react";
import { useServices } from "./StorageProvider";

/**
 * Sends anonymous answer statistics, only when the player has turned them on in Settings (off by default). It sees each
 * finished round as it is stored, queues the per-item outcomes and flushes them in batches. The code loads after the
 * page is interactive, so it stays out of the shell bundle.
 */
export function TelemetryWatcher() {
  const services = useServices();
  useEffect(() => {
    if (!services) return;
    let stop: (() => void) | undefined;
    let live = true;
    void import("../../lib/telemetry/watch").then(({ watchTelemetry }) => {
      if (live) stop = watchTelemetry(services.db);
    });
    return () => {
      live = false;
      stop?.();
    };
  }, [services]);
  return null;
}
