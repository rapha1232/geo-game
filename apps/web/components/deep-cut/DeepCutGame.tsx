"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@meridian/ui";
import { t, type MessageKey } from "../../lib/i18n";
import { LoadFailure, LoadingState } from "../shell/LoadState";
import { useServices } from "../shell/StorageProvider";
import { loadDeepCut, type LoadedDeepCut } from "../../lib/deep-cut/data";
import {
  DEFAULT_CONFIG,
  newSession,
  restore,
  setClock,
  type Config,
  type Session,
} from "../../lib/deep-cut/controller";
import { loadHistory } from "../../lib/results/save";
import { deepCutResult } from "../../lib/results/deep-cut";
import { saveRankIt } from "../../lib/results/rank-it";
import { randomUlid } from "../../lib/results/ulid";
import { browserOffsetMinutes, localDate, msToNextDay } from "../../lib/daily/time";
import { DEEP_CUT_DAILY_GAME_ID } from "../daily/DailyHub";
import { DailySummary } from "../daily/DailySummary";
import type { GameResult } from "@meridian/schemas";
import { DeepCutView } from "./DeepCutView";
import styles from "./deep-cut.module.css";

export const GAME_ID = "deep-cut";
const POOL_KEY = "all";

const newSeed = (): string => {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => "0123456789ABCDEFGHJKMNPQRSTVWXYZ"[b % 32]).join("");
};

/** Loads the data, resumes an unfinished run after a reload, saves after every action and writes the result at the end. */
export function DeepCutGame({ daily = false }: { daily?: boolean }) {
  const gameId = daily ? DEEP_CUT_DAILY_GAME_ID : GAME_ID;
  const services = useServices();
  const [data, setData] = useState<LoadedDeepCut | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const seq = useRef(0);
  const [finished, setFinished] = useState<GameResult | null>(null);
  const version = useRef("");

  useEffect(() => {
    if (!services) return;
    let live = true;
    setError(false);
    void (async () => {
      try {
        const manifest = await services.loader.manifest();
        const loaded = await loadDeepCut(services.loader);
        version.current = manifest.current;
        const saved = await services.store.find(gameId);
        seq.current = saved?.seq ?? 0;
        if (!live) return;
        setData(loaded);
        const today = daily ? localDate(Date.now(), browserOffsetMinutes()) : null;
        if (today) {
          const rows = await services.db.results
            .where("daily_date")
            .equals(today)
            .toArray()
            .catch(() => []);
          if (
            rows.some(
              (r) => r.game_id === "deep-cut" && (r.data as { mode?: string }).mode === "daily",
            )
          ) {
            window.location.replace("/daily");
            return;
          }
        }
        const old = saved?.state as Session | undefined;
        if (
          saved &&
          old &&
          saved.content_version === manifest.current &&
          (!today || old.config.date === today)
        ) {
          const s = restore(old);
          setSession(
            document.visibilityState === "visible" ? setClock(s, true, performance.now()) : s,
          );
        } else if (today) {
          // Today's daily: the same five prompts for everyone, made from the date alone.
          const seed = today.replaceAll("-", "").padEnd(10, "0");
          setSession(
            newSession(
              loaded,
              seed,
              { mode: "daily", timer: 60, date: today },
              [],
              performance.now(),
            ),
          );
        }
      } catch (e) {
        console.error("deep-cut load failed", e);
        if (live) setError(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [services, attempt, daily, gameId]);

  const persist = useCallback(
    (next: Session) => {
      if (!services) return;
      services.store.save({
        game_id: gameId,
        seq: ++seq.current,
        updated_at: Date.now(),
        content_version: version.current,
        title: t("dc.title"),
        progress: t("dc.prompt", {
          n: Math.min(5, next.run.index + 1),
          total: next.run.prompts.length,
        }),
        href: daily ? "/play/deep-cut/daily" : "/play/deep-cut",
        state: next,
      });
    },
    [services, gameId, daily],
  );
  const update = useCallback(
    (next: Session) => {
      setSession(next);
      persist(next);
    },
    [persist],
  );

  // The clock pauses with the tab: the countdown itself only ticks while the page is visible.
  useEffect(() => {
    const onVis = () =>
      setSession((s) =>
        s ? setClock(s, document.visibilityState === "visible", performance.now()) : s,
      );
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // Write the result once, when the run is over.
  useEffect(() => {
    if (!services || !session || session.run.status !== "done" || session.resultId) return;
    const now = Date.now();
    const id = randomUlid(now);
    const marked: Session = { ...session, resultId: id };
    setSession(marked);
    persist(marked);
    const result = deepCutResult(session, { id, contentVersion: version.current, endedAt: now });
    setFinished(result);
    void saveRankIt(services.db, {
      result,
      ...(session.config.mode === "daily"
        ? {}
        : { history: { game_id: GAME_ID, pool_key: POOL_KEY, target_ids: session.history } }),
    });
  }, [services, session, persist]);

  const start = useCallback(async () => {
    if (!services || !data) return;
    const history = await loadHistory(services.db, GAME_ID, POOL_KEY);
    update(newSession(data, newSeed(), config, history, performance.now()));
  }, [services, data, config, update]);

  if (error)
    return (
      <LoadFailure
        className={styles.page}
        message={t("dc.loadError")}
        onRetry={() => setAttempt((n) => n + 1)}
      />
    );
  if (!data) return <LoadingState className={styles.page}>{t("dc.loading")}</LoadingState>;
  if (!session)
    return (
      <div className={styles.page}>
        <header className={styles.head}>
          <h1>{t("dc.title")}</h1>
        </header>
        <p>{t("dc.pitch")}</p>
        <fieldset className={styles.options}>
          <legend className={styles.srOnly}>{t("rk.options")}</legend>
          <label>
            {t("dc.optMode")}
            <select
              value={config.mode}
              onChange={(e) => setConfig({ ...config, mode: e.target.value as Config["mode"] })}
            >
              <option value="run">{t("dc.mode.run")}</option>
              <option value="practice">{t("dc.mode.practice")}</option>
            </select>
          </label>
          {config.mode !== "practice" && (
            <label>
              {t("dc.optTimer")}
              <select
                value={config.timer}
                onChange={(e) =>
                  setConfig({ ...config, timer: Number(e.target.value) as Config["timer"] })
                }
              >
                {[60, 30, 0].map((n) => (
                  <option key={n} value={n}>
                    {t(`dc.optTimer.${n}` as MessageKey)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </fieldset>
        <div>
          <Button variant="primary" onPress={() => void start()}>
            {t("dc.start")}
          </Button>
        </div>
      </div>
    );
  return (
    <DeepCutView
      session={session}
      data={data}
      contentVersion={version.current}
      onChange={update}
      {...(daily && finished
        ? {
            endSlot: (
              <DailySummary
                result={finished}
                link={`${window.location.origin}/daily`}
                msToNext={msToNextDay(Date.now(), browserOffsetMinutes())}
              />
            ),
          }
        : {})}
      onAgain={() => {
        void services?.store.discard(gameId);
        setSession(null);
      }}
    />
  );
}
