"use client";

import { useEffect, useState } from "react";
import { Button, Card } from "@meridian/ui";
import { dailySchedule, gameResult, type GameResult } from "@meridian/schemas";
import { browserOffsetMinutes, localDate, msToNextDay } from "../../lib/daily/time";
import { t, type MessageKey } from "../../lib/i18n";
import { useServices } from "../shell/StorageProvider";
import { DailySummary } from "./DailySummary";
import { dailyBundleShare } from "../../lib/daily/share";
import { GameArt, artFor, hueFor } from "../home/GameArt";
import styles from "./daily.module.css";
import { track } from "../../lib/observability/analytics";
import "../../lib/messages/daily";

export const DAILY_GAME_ID = "silhouette:daily";
export const FACT_PIN_DAILY_GAME_ID = "fact-pin:daily";
export const BORDER_RUN_DAILY_GAME_ID = "border-run:daily";
export const QUIZ_DAILY_GAME_ID = "quiz:daily";
export const DEEP_CUT_DAILY_GAME_ID = "deep-cut:daily";

type State =
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "ready"; date: string; resumable: boolean }
  | { kind: "done"; date: string; result: GameResult };

type DailyGame = {
  id: "silhouette" | "fact-pin" | "border-run" | "quiz" | "deep-cut";
  /** The schedule pack; the daily quiz has none, it rotates by date. */
  pack: string | null;
  sessionId: string;
  href: string;
  keepPlaying: string;
  title: MessageKey;
  body: MessageKey;
  play: MessageKey;
  resume: MessageKey;
};

const GAMES: DailyGame[] = [
  {
    id: "silhouette",
    pack: "daily.silhouette",
    sessionId: DAILY_GAME_ID,
    href: "/play/silhouette/daily",
    keepPlaying: "/play/silhouette",
    title: "daily.silhouette",
    body: "daily.silhouetteBody",
    play: "daily.play",
    resume: "daily.resume",
  },
  {
    id: "fact-pin",
    pack: "daily.fact-pin",
    sessionId: FACT_PIN_DAILY_GAME_ID,
    href: "/play/fact-pin/daily",
    keepPlaying: "/play/fact-pin",
    title: "daily.factPin",
    body: "daily.factPinBody",
    play: "daily.playFactPin",
    resume: "daily.resumeFactPin",
  },
  {
    id: "border-run",
    pack: "daily.border-run",
    sessionId: BORDER_RUN_DAILY_GAME_ID,
    href: "/play/border-run/daily",
    keepPlaying: "/play/border-run",
    title: "daily.borderRun",
    body: "daily.borderRunBody",
    play: "daily.playBorderRun",
    resume: "daily.resumeBorderRun",
  },
  {
    id: "quiz",
    pack: null,
    sessionId: QUIZ_DAILY_GAME_ID,
    href: "/play/quiz/daily",
    keepPlaying: "/play/quiz",
    title: "daily.quiz",
    body: "daily.quizBody",
    play: "daily.playQuiz",
    resume: "daily.resumeQuiz",
  },
  {
    id: "deep-cut",
    pack: null,
    sessionId: DEEP_CUT_DAILY_GAME_ID,
    href: "/play/deep-cut/daily",
    keepPlaying: "/play/deep-cut",
    title: "daily.deepCut",
    body: "daily.deepCutBody",
    play: "daily.playDeepCut",
    resume: "daily.resumeDeepCut",
  },
];

/** `/daily`: today's optional puzzles for the player's local date. Each summary leads on to unlimited play. */
export function DailyHub() {
  const services = useServices();
  const [states, setStates] = useState<Record<string, State>>({});
  const [now] = useState(() => Date.now());
  const offset = typeof window === "undefined" ? 0 : browserOffsetMinutes();

  useEffect(() => {
    if (!services) return;
    let live = true;
    const date = localDate(Date.now(), offset);
    const set = (id: string, s: State) => live && setStates((cur) => ({ ...cur, [id]: s }));
    void (async () => {
      const rows = await services.db.results
        .where("daily_date")
        .equals(date)
        .toArray()
        .catch(() => []);
      const played = rows
        .map((r) => gameResult.safeParse(r.data))
        .flatMap((p) => (p.success && p.data.mode === "daily" ? [p.data] : []))
        .sort((a, b) => a.ended_at.localeCompare(b.ended_at));
      for (const g of GAMES) {
        try {
          if (g.pack) {
            const schedule = dailySchedule.parse(await services.loader.pack(g.pack));
            if (!schedule.days[date]) {
              set(g.id, { kind: "unavailable" });
              continue;
            }
          }
          const done = played.find((r) => r.game_id === g.id);
          if (done) {
            set(g.id, { kind: "done", date, result: done });
            continue;
          }
          const saved = await services.store.find(g.sessionId);
          const savedDate =
            (saved?.state as { config?: { date?: string }; date?: string } | undefined)?.config
              ?.date ??
            (saved?.state as { date?: string } | undefined)?.date ??
            (g.id === "quiz"
              ? (saved?.state as { seed?: string } | undefined)?.seed ===
                date.replaceAll("-", "").padEnd(10, "0")
                ? date
                : undefined
              : undefined);
          set(g.id, { kind: "ready", date, resumable: savedDate === date });
        } catch {
          set(g.id, { kind: "unavailable" });
        }
      }
    })();
    return () => {
      live = false;
    };
  }, [services, offset]);

  const done = GAMES.flatMap((g) => {
    const s = states[g.id];
    return s?.kind === "done" ? [s] : [];
  });
  return (
    <section className={styles.page}>
      <h1>{t("daily.title")}</h1>
      <p className={styles.lede}>{t("daily.lede")}</p>
      {done.length >= 2 && (
        <ShareAll
          text={dailyBundleShare(
            done.map((d) => d.result),
            typeof window === "undefined" ? "" : `${window.location.origin}/daily`,
            done[0]!.date,
            GAMES.length,
          )}
          count={done.length}
          total={GAMES.length}
        />
      )}
      <div className={`${styles.grid} fx-stagger`}>
        {GAMES.map((g) => {
          const state = states[g.id] ?? { kind: "loading" };
          return (
            <div key={g.id} className={styles.game} data-state={state.kind}>
              <Card className={styles.summary} data-hue={hueFor(g.href)} data-tilt="">
                <GameArt name={artFor(g.href)} className={styles.art} />
                <h2>{t(g.title)}</h2>
                <p>{t(g.body)}</p>
                {state.kind === "loading" && <p role="status">{t("daily.loading")}</p>}
                {state.kind === "unavailable" && (
                  <>
                    <p role="status">{t("daily.unavailable")}</p>
                    <a className={styles.primary} href={g.keepPlaying}>
                      {t("daily.keepPlaying")}
                    </a>
                  </>
                )}
                {state.kind === "ready" && (
                  <a className={styles.primary} href={g.href}>
                    {state.resumable ? t(g.resume) : t(g.play)}{" "}
                    <span aria-hidden="true" className={styles.arrow}>
                      →
                    </span>
                  </a>
                )}
              </Card>
              {state.kind === "done" && (
                <DailySummary
                  result={state.result}
                  link={typeof window === "undefined" ? "" : `${window.location.origin}/daily`}
                  msToNext={msToNextDay(now, offset)}
                />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Copies one spoiler-free summary of every daily played today, once two or more are done. */
function ShareAll({ text, count, total }: { text: string; count: number; total: number }) {
  const [copy, setCopy] = useState<"idle" | "ok" | "failed">("idle");
  return (
    <Card className={styles.shareAll}>
      <p>{t("daily.shareAllBody", { count, total })}</p>
      <Button
        variant="primary"
        onPress={() => {
          // A missing clipboard API (insecure context, old browser) falls back to the selectable text.
          const write =
            navigator.clipboard?.writeText(text) ?? Promise.reject(new Error("no clipboard"));
          write.then(
            () => {
              setCopy("ok");
              track("result_shared", { game: "all", what: "daily_bundle" });
            },
            () => setCopy("failed"),
          );
        }}
      >
        {t("daily.shareAll")}
      </Button>
      <p role="status" className={styles.shareAllStatus}>
        {copy === "ok" ? t("daily.copied") : copy === "failed" ? t("daily.copyFailed") : ""}
      </p>
      {copy === "failed" && <pre className={styles.shareAllText}>{text}</pre>}
    </Card>
  );
}
