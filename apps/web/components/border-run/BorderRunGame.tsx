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
  newDailySession,
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
import { dailySchedule, gameResult, type GameResult } from "@meridian/schemas";
import { browserOffsetMinutes, localDate, msToNextDay } from "../../lib/daily/time";
import { BORDER_RUN_DAILY_GAME_ID } from "../daily/DailyHub";
import { DailySummary } from "../daily/DailySummary";
import { BorderRunView } from "./BorderRunView";
import styles from "./border-run.module.css";
import "../../lib/messages/br";
import "../../lib/messages/daily";

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
export function BorderRunGame({ daily = false }: { daily?: boolean }) {
  const gameId = daily ? BORDER_RUN_DAILY_GAME_ID : GAME_ID;
  const services = useServices();
  const [data, setData] = useState<LoadedBorderRun | null>(null);
  const [session, setSession] = useState<Session | null>(null);
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
        const loaded = assembleBorderRun(await loadBorderRunPacks(services.loader));
        version.current = manifest.current;
        const saved = await services.store.find(gameId);
        seq.current = saved?.seq ?? 0;
        const now = Date.now();
        let restored: Session | null = null;
        let start: Session;
        if (daily) {
          const date = localDate(now, browserOffsetMinutes());
          const schedule = dailySchedule.parse(await services.loader.pack("daily.border-run"));
          const [a, b] = schedule.days[date] ?? [];
          if (!a || !b) throw new Error("no daily for today");
          const rows = await services.db.results.where("daily_date").equals(date).toArray();
          const played = rows.some((r) => {
            const p = gameResult.safeParse(r.data);
            return p.success && p.data.mode === "daily" && p.data.game_id === "border-run";
          });
          if (played) {
            window.location.replace("/daily");
            return;
          }
          const savedState = saved?.state as Session | undefined;
          restored =
            saved && savedState?.config.date === date && saved.content_version === manifest.current
              ? restore(savedState)
              : null;
          start =
            restored ??
            newDailySession(loaded, date.replaceAll("-", "").padEnd(10, "0"), a, b, date, now);
        } else {
          restored =
            saved && saved.content_version === manifest.current
              ? restore(saved.state as Session)
              : null;
          start =
            restored ??
            newSession(
              loaded,
              newSeed(),
              DEFAULT_CONFIG,
              await loadHistory(services.db, GAME_ID, poolKey(DEFAULT_CONFIG)),
              now,
            );
        }
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
  }, [services, attempt, daily, gameId]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const persist = useCallback(
    (next: Session) => {
      if (!services) return;
      services.store.save({
        game_id: gameId,
        seq: ++seq.current,
        updated_at: Date.now(),
        content_version: version.current,
        title: t("br.title"),
        progress: t("br.round", { n: next.roundNo }),
        href: daily ? "/play/border-run/daily" : "/play/border-run",
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
    const result = borderRunResult(session, { id, contentVersion: version.current, endedAt: now });
    setFinished(result);
    void saveRound(services.db, {
      result,
      mastery: [],
      ...(daily
        ? {}
        : {
            history: {
              game_id: GAME_ID,
              pool_key: poolKey(session.config),
              target_ids: session.history,
            },
          }),
    });
  }, [services, data, session, persist, daily]);

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
    />
  );
}
