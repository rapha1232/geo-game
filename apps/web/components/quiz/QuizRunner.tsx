"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card } from "@meridian/ui";
import { pause, resume, restoreQuiz, tick, timeLeftMs, type QuizConfig } from "@meridian/quiz";
import { t } from "../../lib/i18n";
import { assembleQuiz, loadQuizPacks } from "../../lib/quiz/data";
import { defaultConfig, findQuiz, formatClock, type NamedQuiz } from "../../lib/quiz/library";
import { quizMastery, quizResult, saveQuiz, type PbOutcome } from "../../lib/quiz/results";
import {
  newQuiz,
  newQuizSeed,
  nextHistory,
  poolKey,
  practiceMisses,
  replaySame,
  type QuizSession,
} from "../../lib/quiz/session";
import { loadSettings } from "../../lib/settings/settings";
import { loadMastery } from "../../lib/results/save";
import { randomUlid } from "../../lib/results/ulid";
import type { MasteryRecord } from "../../lib/storage/db";
import { LoadFailure, LoadingState } from "../shell/LoadState";
import { useServices } from "../shell/StorageProvider";
import { QuizConfigure } from "./QuizConfigure";
import { QuizMap } from "./QuizMap";
import { QuizPlay } from "./QuizPlay";
import { QuizReview } from "./QuizReview";
import styles from "./quiz.module.css";

const GAME_ID = "quiz";
const mono = (): number => performance.now();

type Loaded = ReturnType<typeof assembleQuiz>;
type Stage = "configure" | "play" | "review";

/** One named quiz from configuration to review: saves after every action, resumes after a reload, writes the result. */
export function QuizRunner({ slug }: { slug: string }) {
  const services = useServices();
  const named: NamedQuiz | undefined = findQuiz(slug);
  const [data, setData] = useState<Loaded | null>(null);
  const [flags, setFlags] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [session, setSession] = useState<QuizSession | null>(null);
  const [stage, setStage] = useState<Stage>("configure");
  const [resumeOffer, setResumeOffer] = useState<QuizSession | null>(null);
  const [accessible, setAccessible] = useState(false);
  const [now, setNow] = useState(0);
  const [pb, setPb] = useState<PbOutcome | null>(null);
  const [saved, setSaved] = useState(true);
  const [pbs, setPbs] = useState<Map<string, number>>(new Map());
  const [initial, setInitial] = useState<QuizConfig | null>(null);
  const seq = useRef(0);
  const version = useRef("");
  const history = useRef<string[]>([]);

  useEffect(() => {
    if (!services || !named) return;
    let live = true;
    setError(false);
    void (async () => {
      try {
        const { packs, edges } = await loadQuizPacks(services.loader);
        const manifest = await services.loader.manifest();
        const loaded = assembleQuiz(packs, edges);
        const rows = await services.db.pbs.toArray().catch(() => []);
        const old = await services.store.find(GAME_ID);
        const hist = await services.db.history
          .get([GAME_ID, poolKey(defaultConfig(named))])
          .catch(() => undefined);
        const remembered = (await services.db.settings.get("settings").catch(() => undefined))
          ?.value?.[`quiz:${named.template}`] as Partial<QuizConfig> | undefined;
        const prefs = await loadSettings(services.db);
        if (!live) return;
        setAccessible(prefs.accessibleDefault);
        version.current = manifest.current;
        seq.current = old?.seq ?? 0;
        history.current = hist?.target_ids ?? [];
        setPbs(new Map(rows.map((r) => [r.pb_key, r.score])));
        setInitial({
          ...defaultConfig(named),
          strictness: prefs.strictness,
          countrySet: prefs.countrySet,
          ...(remembered?.difficulty ? { difficulty: remembered.difficulty } : {}),
          ...(remembered?.strictness ? { strictness: remembered.strictness } : {}),
        });
        setData(loaded);
        const s = old?.state as QuizSession | undefined;
        if (
          s &&
          s.slug === slug &&
          s.state.phase !== "review" &&
          old?.content_version === manifest.current
        )
          setResumeOffer({ ...s, state: restoreQuiz(s.state), resumed: true });
      } catch {
        if (live) setError(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [services, named, slug, attempt]);

  // Flag quizzes load the flags pack.
  useEffect(() => {
    if (!services || !session || session.state.quiz.config.template !== "flags.by-country" || flags)
      return;
    void services.loader
      .pack<{ flags: Record<string, string> }>("flags.svg")
      .then((p) => setFlags(p.flags))
      .catch(() => undefined);
  }, [services, session, flags]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const persist = useCallback(
    (next: QuizSession) => {
      if (!services || !named) return;
      const done = next.state.items.filter((i) => i.status !== "pending").length;
      services.store.save({
        game_id: GAME_ID,
        seq: ++seq.current,
        updated_at: Date.now(),
        content_version: version.current,
        title: named.title,
        progress: `${done}/${next.state.items.length}`,
        href: `/play/quiz/${slug}`,
        state: next,
      });
    },
    [services, named, slug],
  );
  const update = useCallback(
    (next: QuizSession) => {
      setSession(next);
      persist(next);
    },
    [persist],
  );

  // The clock and the end of time.
  useEffect(() => {
    if (stage !== "play") return;
    const id = setInterval(() => {
      const t0 = mono();
      setNow(t0);
      setSession((s) => {
        if (!s) return s;
        const next = tick(s.state, t0);
        return next === s.state ? s : { ...s, state: next };
      });
    }, 250);
    return () => clearInterval(id);
  }, [stage]);

  // Pause while the tab is hidden, resume when it is back (only if it was playing).
  const wasPlaying = useRef(false);
  useEffect(() => {
    const onVis = () =>
      setSession((s) => {
        if (!s) return s;
        if (document.visibilityState === "hidden") {
          wasPlaying.current = s.state.phase === "playing";
          const next = pause(s.state, mono());
          if (next !== s.state) services?.store.flush();
          return next === s.state ? s : { ...s, state: next };
        }
        if (wasPlaying.current) {
          wasPlaying.current = false;
          return { ...s, state: resume(s.state, mono()) };
        }
        return s;
      });
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [services]);

  // Review: write the result once.
  useEffect(() => {
    if (!services || !session || !data || session.state.phase !== "review" || session.resultId)
      return;
    setStage("review");
    const id = randomUlid(Date.now());
    const marked = { ...session, resultId: id };
    setSession(marked);
    persist(marked);
    void (async () => {
      const t0 = mono();
      const result = quizResult(session.state, {
        id,
        contentVersion: version.current,
        seed: session.seed,
        kind: session.kind,
        resumed: session.resumed,
        endedAt: Date.now(),
        startedAt: session.startedWall,
        now: t0,
      });
      const previous = await loadMastery(
        services.db,
        session.state.quiz.items.map((i) => i.id),
      );
      const config = session.state.quiz.config;
      const subset = config.count !== "all" && session.kind === "normal";
      const pool = data.world.entities.filter((e) => e.type === "country").length;
      const nextHist = subset ? nextHistory(history.current, session, pool) : null;
      const out = await saveQuiz(services.db, {
        result,
        state: session.state,
        mastery: config.learn ? [] : quizMastery(session.state, previous, Date.now()),
        ...(nextHist ? { history: { pool_key: poolKey(config), target_ids: nextHist } } : {}),
      });
      if (nextHist) history.current = nextHist;
      setSaved(out.saved);
      setPb(out.pb);
    })();
  }, [services, session, data, persist]);

  const begin = useCallback(
    (config: QuizConfig, kind: "normal" | "practice") => {
      if (!data || !named || !services) return;
      void (async () => {
        const nowWall = Date.now();
        const seed = newQuizSeed();
        let s: QuizSession;
        if (kind === "practice") {
          const rows = (await services.db.mastery.toArray().catch(() => [] as MasteryRecord[])).map(
            (r) => ({
              entityId: r.entity_id,
              skill: r.skill,
              mastery: r.mastery,
              dueAt: Date.parse(r.due_at),
            }),
          );
          s = practiceMisses(data.world, slug, config, seed, rows, nowWall);
        } else s = newQuiz(data.world, slug, config, seed, history.current, nowWall);
        await services.db.settings
          .put({
            key: "settings",
            value: {
              ...((await services.db.settings.get("settings").catch(() => undefined))?.value ?? {}),
              [`quiz:${named.template}`]: {
                difficulty: config.difficulty,
                strictness: config.strictness,
              },
            },
          })
          .catch(() => undefined);
        setPb(null);
        setSaved(true);
        setFlags(null);
        setResumeOffer(null);
        setStage("play");
        update(s);
      })();
    },
    [data, named, services, slug, update],
  );

  if (!named)
    return (
      <section className={styles.page} role="alert">
        <p>{t("qz.unknown")}</p>
        <a href="/play/quiz">{t("qz.backToLibrary")}</a>
      </section>
    );
  if (error)
    return <LoadFailure className={styles.page} message={t("qz.loadError")} onRetry={retry} />;
  if (!data || !initial)
    return <LoadingState className={styles.page}>{t("qz.loading")}</LoadingState>;

  if (resumeOffer && stage === "configure") {
    const left = timeLeftMs(resumeOffer.state, 0);
    const done = resumeOffer.state.items.filter((i) => i.status !== "pending").length;
    return (
      <section className={styles.page}>
        <Card className={styles.card} role="dialog" aria-labelledby="resume-h">
          <h1 id="resume-h">{t("qz.resumeTitle")}</h1>
          <p>
            {left === null
              ? t("qz.resumeBodyUntimed", { done, total: resumeOffer.state.items.length })
              : t("qz.resumeBody", {
                  done,
                  total: resumeOffer.state.items.length,
                  time: formatClock(
                    (resumeOffer.state.quiz.limitMs ?? 0) - resumeOffer.state.timer.elapsedMs,
                  ),
                })}
          </p>
          <div className={styles.row}>
            <Button
              variant="primary"
              onPress={() => {
                const s = { ...resumeOffer, state: resume(resumeOffer.state, mono()) };
                setResumeOffer(null);
                setStage("play");
                update(s);
              }}
            >
              {t("qz.resume")}
            </Button>
            <Button
              onPress={() => {
                void services?.store.discard(GAME_ID);
                setResumeOffer(null);
              }}
            >
              {t("qz.startOver")}
            </Button>
          </div>
        </Card>
      </section>
    );
  }

  if (stage === "configure" || !session)
    return (
      <section className={styles.page}>
        <QuizConfigure
          quiz={named}
          world={data.world}
          initial={initial}
          bestPercent={(key) => (pbs.has(key) ? Math.round((pbs.get(key) as number) * 100) : null)}
          accessible={accessible}
          onAccessible={setAccessible}
          onStart={(c) => begin(c, "normal")}
          onPractice={(c) => begin(c, "practice")}
        />
      </section>
    );

  if (stage === "review" || session.state.phase === "review")
    return (
      <section className={styles.page}>
        <QuizReview
          world={data.world}
          session={session}
          now={now}
          pb={pb}
          saved={saved}
          contentVersion={version.current}
          onPlayAgain={() => begin(session.state.quiz.config, session.kind)}
          onReplay={() => {
            setPb(null);
            setStage("play");
            update(replaySame(data.world, session, Date.now()));
          }}
          onPractice={() => begin(session.state.quiz.config, "practice")}
          onConfigure={() => {
            setStage("configure");
            setSession(null);
          }}
          mapSlot={
            session.state.quiz.config.format === "TYPE_ALL" ? (
              <QuizMap
                world={data.world}
                labelPoints={data.facts.labelPoints}
                states={
                  Object.fromEntries(
                    session.state.items.map((it, i) => [
                      session.state.quiz.items[i]?.id as string,
                      it.status === "correct" ? "correct" : "wrong",
                    ]),
                  ) as never
                }
                mode="view"
              />
            ) : null
          }
        />
      </section>
    );

  return (
    <section className={styles.page}>
      <QuizPlay
        world={data.world}
        facts={data.facts}
        neighbors={data.neighbors}
        flags={flags}
        session={session}
        now={now}
        accessible={accessible}
        onSession={update}
      />
    </section>
  );
}
