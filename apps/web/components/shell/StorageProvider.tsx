"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ContentLoader } from "../../lib/content/loader";
import { MeridianDb } from "../../lib/storage/db";
import { SessionStore, type StoreStatus } from "../../lib/storage/session-store";
import { requestPersistence } from "../../lib/storage/persist";
import { cue } from "../../lib/sound/cue";

type Services = {
  db: MeridianDb;
  store: SessionStore;
  loader: ContentLoader;
  status: StoreStatus;
  online: boolean;
};
const Ctx = createContext<Services | null>(null);
/** Exported so component tests can supply fake services. */
export const ServicesContext = Ctx;

/** Creates the browser-only services once. Storage failures degrade to in-memory play (AC-PL-011). */
export function StorageProvider({
  children,
  contentHost,
}: {
  children: ReactNode;
  contentHost: string;
}) {
  const [status, setStatus] = useState<StoreStatus>("ok");
  const [online, setOnline] = useState(true);
  const services = useMemo(() => {
    if (typeof window === "undefined") return null;
    let db: MeridianDb | null = null;
    try {
      db = new MeridianDb();
    } catch {
      db = null;
    }
    const local = (() => {
      try {
        return window.localStorage;
      } catch {
        return null;
      }
    })();
    if (!db) return null;
    const store = new SessionStore({ db, local, now: () => Date.now(), onStatus: setStatus });
    const loader = new ContentLoader({ host: contentHost, db });
    void db.open().catch(() => setStatus("unavailable"));
    // The first result written in this tab asks for persistent storage (R-13); later ones need not ask again.
    // A round that just ended also plays the "finished" sound when sounds are on. An import (many old results at
    // once) stays silent: only a result that ended in the last few seconds counts.
    let asked = false;
    db.results.hook("creating", (_key, obj: { ended_at?: string }) => {
      const ended = Date.parse(obj.ended_at ?? "");
      if (Date.now() - ended < 10_000) setTimeout(() => cue("complete"), 250);
      if (asked) return;
      asked = true;
      setTimeout(() => void requestPersistence(), 0);
    });
    return { db, store, loader };
  }, [contentHost]);

  useEffect(() => {
    if (!services) return;
    const flush = () => {
      if (document.visibilityState === "hidden") void services.store.flush();
    };
    const sync = () => setOnline(navigator.onLine);
    sync();
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", flush);
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, [services]);

  const value = useMemo(
    () => (services ? { ...services, status, online } : null),
    [services, status, online],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Null during server rendering and when IndexedDB cannot be constructed at all. */
export const useServices = (): Services | null => useContext(Ctx);
