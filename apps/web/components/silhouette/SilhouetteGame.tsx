"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@meridian/ui";
import { t } from "../../lib/i18n";
import { useServices } from "../shell/StorageProvider";
import { assemble, loadSilhouettePacks, type Loaded } from "../../lib/silhouette/data";
import {
  DEFAULT_CONFIG,
  newSession,
  restore,
  setClock,
  type Config,
  type Session,
} from "../../lib/silhouette/controller";
import { loadHistory, loadMastery, saveRound } from "../../lib/results/save";
import { masteryUpdates, silhouetteResult } from "../../lib/results/silhouette";
import { randomUlid } from "../../lib/results/ulid";
import { SilhouetteView } from "./SilhouetteView";
import styles from "./silhouette.module.css";

export const GAME_ID = "silhouette";

const newSeed = (): string => {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => "0123456789ABCDEFGHJKMNPQRSTVWXYZ"[b % 32]).join("");
};
const poolKey = (c: Config): string =>
  `${c.pool.kind}${c.pool.kind === "continent" ? `:${c.pool.continent}` : ""}|${c.difficulty}`;

/**
 * Loads the packs, restores an unfinished session if there is one, saves after every action (AC-SH-016), keeps the
 * active-time clock honest, and writes the result and mastery when a round ends (AC-PL-010).
 */
export function SilhouetteGame() {
  const services = useServices();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const seq = useRef(0);
  const version = useRef("");

  useEffect(() => {
    if (!services) return;
    let live = true;
    setError(false);
    void (async () => {
      try {
        const data = assemble(await loadSilhouettePacks(services.loader));
        const manifest = await services.loader.manifest();
        const saved = await services.store.find(GAME_ID);
        if (!live) return;
        version.current = manifest.current;
        seq.current = saved?.seq ?? 0;
        const now = Date.now();
        const restored =
          saved && saved.content_version === manifest.current
            ? restore(saved.state as Session)
            : null;
        const start =
          restored ??
          newSession(
            data.world,
            newSeed(),
            DEFAULT_CONFIG,
            await loadHistory(services.db, GAME_ID, poolKey(DEFAULT_CONFIG)),
            now,
          );
        setLoaded(data);
        setSession(document.visibilityState === "visible" ? setClock(start, true, now) : start);
      } catch {
        if (live) setError(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [services, attempt]);

  const persist = useCallback(
    (next: Session) => {
      if (!services) return;
      services.store.save({
        game_id: GAME_ID,
        seq: ++seq.current,
        updated_at: Date.now(),
        content_version: version.current,
        title: t("sil.title"),
        progress: t("sil.round", { n: next.roundNo }),
        href: "/play/silhouette",
        state: next,
      });
    },
    [services],
  );

  const update = useCallback(
    (next: Session) => {
      setSession(next);
      persist(next);
    },
    [persist],
  );

  // Pause the clock while the tab is hidden.
  useEffect(() => {
    const onVisibility = () =>
      setSession((s) => (s ? setClock(s, document.visibilityState === "visible", Date.now()) : s));
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Write the result once, when the round is fully over (guess, then follow-ups).
  useEffect(() => {
    if (!services || !loaded || !session || session.phase !== "learn" || session.resultId) return;
    const now = Date.now();
    const id = randomUlid(now);
    const marked: Session = { ...session, resultId: id };
    setSession(marked);
    persist(marked);
    void (async () => {
      const previous = await loadMastery(services.db, [session.round.targetId]);
      await saveRound(services.db, {
        result: silhouetteResult(session, { id, contentVersion: version.current, endedAt: now }),
        mastery: masteryUpdates(session, previous, now),
        history: {
          game_id: GAME_ID,
          pool_key: poolKey(session.config),
          target_ids: session.history,
        },
      });
    })();
  }, [services, loaded, session, persist]);

  if (error)
    return (
      <div className={styles.page} role="alert">
        <p>{t("sil.loadError")}</p>
        <Button onPress={() => setAttempt((n) => n + 1)}>{t("sil.retry")}</Button>
      </div>
    );
  if (!loaded || !session)
    return (
      <div className={styles.page} role="status">
        {t("sil.loading")}
      </div>
    );
  return (
    <SilhouetteView
      session={session}
      world={loaded.world}
      shapes={loaded.shapes}
      onChange={(next) => update(next)}
    />
  );
}
