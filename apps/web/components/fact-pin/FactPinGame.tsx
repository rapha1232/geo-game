"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Card } from "@meridian/ui";
import {
  DEFAULT_CONFIG,
  currentFactId,
  eligibleFacts,
  pause,
  resume,
  tick,
  type FactPinConfig,
} from "@meridian/fact-pin";
import { t } from "../../lib/i18n";
import { FACT_PIN_DAILY_GAME_ID } from "../daily/DailyHub";
import { DailySummary } from "../daily/DailySummary";
import { browserOffsetMinutes, localDate, msToNextDay } from "../../lib/daily/time";
import type { GameResult } from "@meridian/schemas";
import { LoadFailure, LoadingState } from "../shell/LoadState";
import { useServices } from "../shell/StorageProvider";
import { assembleFactPin, loadFactPinPacks, type LoadedFactPin } from "../../lib/fact-pin/data";
import {
  NotEnoughFacts,
  newFactSession,
  newSeed,
  pbKeyOf,
  poolKey,
  newDailySession,
  restoreSession,
  type FactSession,
} from "../../lib/fact-pin/session";
import { factPinResult, saveFactRun, type FactPbOutcome } from "../../lib/fact-pin/results";
import { randomUlid } from "../../lib/results/ulid";
import { ReportButton } from "../report/ReportButton";
import { FactPinConfigure } from "./FactPinConfigure";
import { FactPinView } from "./FactPinView";
import styles from "./fact-pin.module.css";

export const GAME_ID = "fact-pin";
const mono = (): number => performance.now();

type Stage = "configure" | "play";

/** Loads the packs, saves after every action, resumes after a reload, and writes the result when a run ends. */
export function FactPinGame({ daily = false }: { daily?: boolean }) {
  const gameId = daily ? FACT_PIN_DAILY_GAME_ID : GAME_ID;
  const services = useServices();
  const [data, setData] = useState<LoadedFactPin | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [config, setConfig] = useState<FactPinConfig>(DEFAULT_CONFIG);
  const [configError, setConfigError] = useState(false);
  const [session, setSession] = useState<FactSession | null>(null);
  const [offer, setOffer] = useState<FactSession | null>(null);
  const [stage, setStage] = useState<Stage>("configure");
  const [now, setNow] = useState(0);
  const [pbs, setPbs] = useState<Map<string, [number, number]>>(new Map());
  const [pb, setPb] = useState<FactPbOutcome | null>(null);
  const [saved, setSaved] = useState(true);
  const [shared, setShared] = useState(false);
  const seq = useRef(0);
  const version = useRef("");
  const seen = useRef<Map<string, string[]>>(new Map());
  /** Daily facts of the last week are kept out of Endless (fact-pin §11). */
  const recentDailies = useRef<Set<string>>(new Set());
  const [finished, setFinished] = useState<GameResult | null>(null);

  useEffect(() => {
    if (!services) return;
    let live = true;
    setError(false);
    void (async () => {
      try {
        const manifest = await services.loader.manifest();
        const loaded = assembleFactPin(await loadFactPinPacks(services.loader));
        const rows = await services.db.pbs.toArray().catch(() => []);
        const hist = await services.db.history.toArray().catch(() => []);
        const old = await services.store.find(gameId);
        const remembered = (await services.db.settings.get("settings").catch(() => undefined))
          ?.value?.["fact-pin"] as Partial<FactPinConfig> | undefined;
        if (!live) return;
        version.current = manifest.current;
        seq.current = old?.seq ?? 0;
        setPbs(
          new Map(
            rows
              .filter((r) => r.pb_key.startsWith("fact-pin:"))
              .map((r) => [r.pb_key, [r.score, 0] as [number, number]]),
          ),
        );
        for (const h of hist) if (h.game_id === GAME_ID) seen.current.set(h.pool_key, h.target_ids);
        if (remembered)
          setConfig((c) => ({
            ...c,
            ...(remembered.categories ? { categories: remembered.categories } : {}),
            ...(remembered.timerSec !== undefined ? { timerSec: remembered.timerSec } : {}),
            ...(remembered.difficulty ? { difficulty: remembered.difficulty } : {}),
          }));
        const today = localDate(Date.now(), browserOffsetMinutes());
        const schedule = await services.loader
          .pack<{ days: Record<string, string[]> }>("daily.fact-pin")
          .catch(() => null);
        if (!live) return;
        if (schedule && !daily) {
          const back = new Date(`${today}T00:00:00Z`).getTime();
          for (let i = 0; i <= 7; i++) {
            const d = new Date(back - i * 86_400_000).toISOString().slice(0, 10);
            for (const id of schedule.days[d] ?? []) recentDailies.current.add(id);
          }
        }
        if (daily) {
          // Today's Daily 5: the schedule picks the facts. Played already: back to the hub.
          const ids = schedule?.days[today];
          if (!ids) throw new Error("no daily for today");
          const rowsToday = await services.db.results.where("daily_date").equals(today).toArray();
          if (
            rowsToday.some((r) => {
              const d = r.data as { game_id?: unknown; mode?: unknown } | null;
              return d?.game_id === "fact-pin" && d.mode === "daily";
            })
          ) {
            window.location.replace("/daily");
            return;
          }
          const saved = old?.state as FactSession | undefined;
          const resumable =
            saved &&
            saved.date === today &&
            saved.run.phase !== "done" &&
            old?.content_version === manifest.current;
          const start = resumable
            ? restoreSession(saved)
            : newDailySession(DEFAULT_CONFIG, ids, today, Date.now(), mono());
          setData(loaded);
          setStage("play");
          setSession({
            ...start,
            run: start.run.phase === "asking" ? resume(start.run, mono()) : start.run,
          });
          return;
        }
        setData(loaded);
        const s = old?.state as FactSession | undefined;
        if (s && s.run.phase !== "done" && old?.content_version === manifest.current)
          setOffer(restoreSession(s));
      } catch {
        if (live) setError(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [services, attempt, daily, gameId]);

  const categories = useMemo(
    () =>
      data
        ? [
            ...new Set(data.facts.filter((f) => f.status === "published").map((f) => f.category)),
          ].sort()
        : [],
    [data],
  );

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const persist = useCallback(
    (next: FactSession) => {
      if (!services) return;
      services.store.save({
        game_id: gameId,
        seq: ++seq.current,
        updated_at: Date.now(),
        content_version: version.current,
        title: t("fp.title"),
        progress: t("fp.factOf", { n: next.run.index + 1, total: next.run.factIds.length }),
        href: daily ? "/play/fact-pin/daily" : "/play/fact-pin",
        state: next,
      });
    },
    [services, gameId, daily],
  );
  const update = useCallback(
    (next: FactSession) => {
      setSession(next);
      persist(next);
    },
    [persist],
  );

  // The clock: show the time left and confirm the pin when it reaches zero (AC-FP-006, AC-FP-007).
  useEffect(() => {
    if (stage !== "play" || !data) return;
    const id = setInterval(() => {
      const t0 = mono();
      setNow(t0);
      setSession((s) => {
        if (!s || s.run.config.timerSec === 0 || s.run.phase !== "asking") return s;
        const fact = data.byId.get(currentFactId(s.run));
        if (!fact) return s;
        const run = tick(s.run, fact, data.areas, t0);
        if (run === s.run) return s;
        const next = { ...s, run };
        persist(next);
        return next;
      });
    }, 250);
    return () => clearInterval(id);
  }, [stage, data, persist]);

  // Pause the fact timer while the tab is hidden.
  useEffect(() => {
    const onVis = () =>
      setSession((s) => {
        if (!s || s.run.phase !== "asking") return s;
        const run =
          document.visibilityState === "hidden" ? pause(s.run, mono()) : resume(s.run, mono());
        return run === s.run ? s : { ...s, run };
      });
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // Write the result once, when the run is done.
  useEffect(() => {
    if (!services || !session || session.run.phase !== "done" || session.resultId) return;
    const id = randomUlid(Date.now());
    const marked = { ...session, resultId: id };
    setSession(marked);
    persist(marked);
    void (async () => {
      const result = factPinResult(session, {
        id,
        contentVersion: version.current,
        endedAt: Date.now(),
        now: mono(),
      });
      setFinished(result);
      const key = poolKey(session.run.config);
      seen.current.set(key, session.seen);
      const out = await saveFactRun(services.db, {
        result,
        ...(session.kind === "daily"
          ? {}
          : { history: { pool_key: key, target_ids: session.seen } }),
      });
      setSaved(out.saved);
      setPb(out.pb);
      if (out.pb?.isNew)
        setPbs((m) => new Map(m).set(out.pb?.key ?? "", [result.score, result.max_score]));
    })();
  }, [services, session, persist]);

  const start = useCallback(
    (c: FactPinConfig) => {
      if (!data || !services) return;
      const pool = eligibleFacts(data.facts, c);
      if (pool.length < c.runLength) return setConfigError(true);
      setConfigError(false);
      try {
        const s = newFactSession(
          data,
          c,
          seen.current.get(poolKey(c)) ?? [],
          recentDailies.current,
          newSeed(),
          Date.now(),
          mono(),
        );
        void (async () => {
          const cur = (await services.db.settings.get("settings").catch(() => undefined))?.value;
          await services.db.settings.put({
            key: "settings",
            value: {
              ...(cur ?? {}),
              "fact-pin": {
                categories: c.categories,
                timerSec: c.timerSec,
                difficulty: c.difficulty,
              },
            },
          });
        })().catch(() => undefined);
        setPb(null);
        setSaved(true);
        setShared(false);
        setOffer(null);
        setStage("play");
        update(s);
      } catch (e) {
        if (e instanceof NotEnoughFacts) setConfigError(true);
        else throw e;
      }
    },
    [data, services, update],
  );

  if (error)
    return <LoadFailure className={styles.page} message={t("fp.loadError")} onRetry={retry} />;
  if (!data) return <LoadingState className={styles.page}>{t("fp.loading")}</LoadingState>;

  if (offer && stage === "configure")
    return (
      <div className={styles.page}>
        <Card className={styles.card} role="dialog" aria-labelledby="fp-resume">
          <h1 id="fp-resume">{t("fp.resumeTitle")}</h1>
          <p>{t("fp.resumeBody", { n: offer.run.index + 1, total: offer.run.factIds.length })}</p>
          <div className={styles.row}>
            <Button
              variant="primary"
              onPress={() => {
                const run = offer.run.phase === "asking" ? resume(offer.run, mono()) : offer.run;
                setOffer(null);
                setStage("play");
                update({ ...offer, run });
              }}
            >
              {t("fp.resume")}
            </Button>
            <Button
              onPress={() => {
                void services?.store.discard(gameId);
                setOffer(null);
              }}
            >
              {t("fp.startOver")}
            </Button>
          </div>
        </Card>
      </div>
    );

  if (stage === "configure" || !session) {
    const best = pbs.get(pbKeyOf(config));
    return (
      <FactPinConfigure
        config={config}
        categories={categories}
        best={best && best[0] > 0 ? [best[0], config.runLength * 1000] : null}
        error={configError}
        onChange={(c) => {
          setConfig(c);
          setConfigError(false);
        }}
        onStart={() => start(config)}
      />
    );
  }

  return (
    <FactPinView
      data={data}
      session={session}
      now={now}
      clock={mono}
      onChange={update}
      pb={pb}
      saved={saved}
      revealSlot={(fact) => (
        <ReportButton
          targetRef={fact.id}
          defaultCategory="wrong_fact"
          context={{
            game_id: "fact-pin",
            seed: session.seed,
            fact: fact.id,
            content_version: version.current,
            pin: session.run.rounds[session.run.index]?.pin ?? null,
          }}
        />
      )}
      shared={shared}
      onPlayAgain={() => {
        if (daily) return window.location.assign("/play/fact-pin");
        setStage("configure");
        setSession(null);
      }}
      {...(daily && finished
        ? {
            summarySlot: (
              <DailySummary
                result={finished}
                link={`${window.location.origin}/daily`}
                msToNext={msToNextDay(Date.now(), browserOffsetMinutes())}
              />
            ),
          }
        : {})}
      onShare={(text) => {
        void navigator.clipboard
          ?.writeText(`${text} ${window.location.origin}/play/fact-pin`)
          .then(() => setShared(true))
          .catch(() => undefined);
      }}
    />
  );
}
