"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "../../lib/i18n";
import { LoadFailure, LoadingState } from "../shell/LoadState";
import { useServices } from "../shell/StorageProvider";
import {
  assembleBorderRun,
  loadBorderRunPacks,
  type LoadedBorderRun,
} from "../../lib/border-run/data";
import {
  DEFAULT_CONFIG,
  newSession,
  poolKey,
  restore,
  setClock,
  type Config,
  type Session,
} from "../../lib/border-run/controller";
import { loadHistory, saveRound } from "../../lib/results/save";
import { borderRunResult } from "../../lib/results/border-run";
import { randomUlid } from "../../lib/results/ulid";
import { BorderRunView } from "./BorderRunView";
import styles from "./border-run.module.css";

export const GAME_ID = "border-run";

const newSeed = (): string => {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => "0123456789ABCDEFGHJKMNPQRSTVWXYZ"[b % 32]).join("");
};

/**
 * Loads the packs, restores an unfinished session, saves after every action, keeps the active-time clock honest and
 * writes the result when a round ends.
 */
export function BorderRunGame() {
  const services = useServices();
  const [data, setData] = useState<LoadedBorderRun | null>(null);
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
        const manifest = await services.loader.manifest();
        const loaded = assembleBorderRun(await loadBorderRunPacks(services.loader));
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
            loaded,
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
        title: t("br.title"),
        progress: t("br.round", { n: next.roundNo }),
        href: "/play/border-run",
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

  /** Changing the options starts a fresh round with that pool's Repeat Guard history. */
  const reconfigure = useCallback(
    async (config: Config) => {
      if (!services || !data || !session) return;
      const history = await loadHistory(services.db, GAME_ID, poolKey(config));
      update(newSession(data, session.seed, config, history, Date.now()));
    },
    [services, data, session, update],
  );

  useEffect(() => {
    const onVisibility = () =>
      setSession((s) => (s ? setClock(s, document.visibilityState === "visible", Date.now()) : s));
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Write the result once, when the round is over.
  useEffect(() => {
    if (!services || !data || !session || session.phase !== "review" || session.resultId) return;
    const now = Date.now();
    const id = randomUlid(now);
    const marked: Session = { ...session, resultId: id };
    setSession(marked);
    persist(marked);
    void saveRound(services.db, {
      result: borderRunResult(session, { id, contentVersion: version.current, endedAt: now }),
      mastery: [],
      history: {
        game_id: GAME_ID,
        pool_key: poolKey(session.config),
        target_ids: session.history,
      },
    });
  }, [services, data, session, persist]);

  if (error)
    return <LoadFailure className={styles.page} message={t("br.loadError")} onRetry={retry} />;
  if (!data || !session)
    return <LoadingState className={styles.page}>{t("br.loading")}</LoadingState>;
  return (
    <BorderRunView
      session={session}
      data={data}
      contentVersion={version.current}
      onChange={update}
      onConfig={(c) => void reconfigure(c)}
    />
  );
}
