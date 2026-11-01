"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "../../lib/i18n";
import { LoadFailure, LoadingState } from "../shell/LoadState";
import { useServices } from "../shell/StorageProvider";
import { assembleRankIt, loadRankItPacks, type LoadedRankIt } from "../../lib/rank-it/data";
import {
  DEFAULT_CONFIG,
  newSession,
  poolKey,
  restore,
  setClock,
  type Config,
  type Session,
} from "../../lib/rank-it/controller";
import { loadHistory } from "../../lib/results/save";
import { loadBest, pbKey, rankItResult, saveRankIt } from "../../lib/results/rank-it";
import { randomUlid } from "../../lib/results/ulid";
import { RankItView } from "./RankItView";
import styles from "./rank-it.module.css";

export const GAME_ID = "rank-it";

const newSeed = (): string => {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => "0123456789ABCDEFGHJKMNPQRSTVWXYZ"[b % 32]).join("");
};

/** Loads the packs, restores an unfinished round, saves after every action and writes the result when a round ends. */
export function RankItGame() {
  const services = useServices();
  const [data, setData] = useState<LoadedRankIt | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [best, setBest] = useState<number | null>(null);
  const [newBest, setNewBest] = useState(false);
  const seq = useRef(0);
  const version = useRef("");

  useEffect(() => {
    if (!services) return;
    let live = true;
    setError(false);
    void (async () => {
      try {
        const manifest = await services.loader.manifest();
        const loaded = assembleRankIt(await loadRankItPacks(services.loader));
        version.current = manifest.current;
        const saved = await services.store.find(GAME_ID);
        seq.current = saved?.seq ?? 0;
        const now = Date.now();
        const restored =
          saved && saved.content_version === manifest.current
            ? restore(saved.state as Session)
            : null;
        const start =
          restored ??
          newSession(
            loaded.world,
            newSeed(),
            DEFAULT_CONFIG,
            await loadHistory(services.db, GAME_ID, poolKey(DEFAULT_CONFIG)),
            now,
          );
        if (!live) return;
        setData(loaded);
        setSession(document.visibilityState === "visible" ? setClock(start, true, now) : start);
      } catch {
        if (live) setError(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [services, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const persist = useCallback(
    (next: Session) => {
      if (!services) return;
      services.store.save({
        game_id: GAME_ID,
        seq: ++seq.current,
        updated_at: Date.now(),
        content_version: version.current,
        title: t("rk.title"),
        progress: t("rk.round", { n: next.roundNo }),
        href: "/play/rank-it",
        state: next,
      });
    },
    [services],
  );

  const update = useCallback(
    (next: Session) => {
      setSession(next);
      persist(next);
      if (next.phase === "playing") setNewBest(false);
    },
    [persist],
  );

  const reconfigure = useCallback(
    async (config: Config) => {
      if (!services || !data || !session) return;
      const history = await loadHistory(services.db, GAME_ID, poolKey(config));
      update(newSession(data.world, session.seed, config, history, Date.now()));
    },
    [services, data, session, update],
  );

  useEffect(() => {
    const onVisibility = () =>
      setSession((s) => (s ? setClock(s, document.visibilityState === "visible", Date.now()) : s));
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // The streak personal best for the current Higher/Lower pool.
  const key = session ? pbKey(session) : null;
  useEffect(() => {
    if (!services || !key) return setBest(null);
    void loadBest(services.db, key).then(setBest);
  }, [services, key]);

  useEffect(() => {
    if (!services || !data || !session || session.phase !== "revealed" || session.resultId) return;
    const now = Date.now();
    const id = randomUlid(now);
    const marked: Session = { ...session, resultId: id };
    setSession(marked);
    persist(marked);
    void saveRankIt(services.db, {
      result: rankItResult(session, { id, contentVersion: version.current, endedAt: now }),
      history: {
        game_id: GAME_ID,
        pool_key: poolKey(session.config),
        target_ids: session.history,
      },
    }).then((r) => {
      setNewBest(r.newBest);
      if (r.newBest && key) void loadBest(services.db, key).then(setBest);
    });
  }, [services, data, session, persist, key]);

  if (error)
    return <LoadFailure className={styles.page} message={t("rk.loadError")} onRetry={retry} />;
  if (!data || !session)
    return <LoadingState className={styles.page}>{t("rk.loading")}</LoadingState>;
  return (
    <RankItView
      session={session}
      world={data.world}
      best={best}
      newBest={newBest}
      contentVersion={version.current}
      onChange={update}
      onConfig={(c) => void reconfigure(c)}
    />
  );
}
