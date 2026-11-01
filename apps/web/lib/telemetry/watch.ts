import { gameResult } from "@meridian/schemas";
import type { MeridianDb } from "../storage/db";
import { loadSettings } from "../settings/settings";
import { FLUSH_MS, TelemetryClient, browserSender } from "./client";
import { eventsFromResult } from "./events";

/** Hooks finished rounds into the telemetry client. Returns the function that undoes it. */
export function watchTelemetry(db: MeridianDb): () => void {
  const client = new TelemetryClient(async () => (await loadSettings(db)).telemetry, browserSender);
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
}
