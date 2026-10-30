"use client";

import { useEffect, useState } from "react";
import { Card } from "@meridian/ui";
import { dailySchedule, gameResult, type GameResult } from "@meridian/schemas";
import { browserOffsetMinutes, localDate, msToNextDay } from "../../lib/daily/time";
import { t, type MessageKey } from "../../lib/i18n";
import { useServices } from "../shell/StorageProvider";
import { DailySummary } from "./DailySummary";
import styles from "./daily.module.css";

export const DAILY_GAME_ID = "silhouette:daily";
export const FACT_PIN_DAILY_GAME_ID = "fact-pin:daily";

type State =
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "ready"; date: string; resumable: boolean }
  | { kind: "done"; date: string; result: GameResult };

type DailyGame = {
  id: "silhouette" | "fact-pin";
  pack: string;
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
          const schedule = dailySchedule.parse(await services.loader.pack(g.pack));
          if (!schedule.days[date]) {
            set(g.id, { kind: "unavailable" });
            continue;
          }
          const done = played.find((r) => r.game_id === g.id);
          if (done) {
            set(g.id, { kind: "done", date, result: done });
            continue;
          }
          const saved = await services.store.find(g.sessionId);
          const savedDate =
            (saved?.state as { config?: { date?: string }; date?: string } | undefined)?.config
              ?.date ?? (saved?.state as { date?: string } | undefined)?.date;
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

  return (
    <section className={styles.page}>
      <h1>{t("daily.title")}</h1>
      {GAMES.map((g) => {
        const state = states[g.id] ?? { kind: "loading" };
        return (
          <div key={g.id} className={styles.game}>
            <Card className={styles.summary}>
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
                  {state.resumable ? t(g.resume) : t(g.play)}
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
    </section>
  );
}
