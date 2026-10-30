"use client";

import { useEffect, useState } from "react";
import { Card } from "@meridian/ui";
import { dailySchedule, gameResult, type GameResult } from "@meridian/schemas";
import { browserOffsetMinutes, localDate, msToNextDay } from "../../lib/daily/time";
import { t } from "../../lib/i18n";
import { useServices } from "../shell/StorageProvider";
import { DailySummary } from "./DailySummary";
import styles from "./daily.module.css";

export const DAILY_GAME_ID = "silhouette:daily";

type State =
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "ready"; date: string; resumable: boolean }
  | { kind: "done"; date: string; result: GameResult };

/** `/daily`: today's Silhouette for the player's local date. Optional, and the summary leads to Unlimited play. */
export function DailyHub() {
  const services = useServices();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [now] = useState(() => Date.now());
  const offset = typeof window === "undefined" ? 0 : browserOffsetMinutes();

  useEffect(() => {
    if (!services) return;
    let live = true;
    void (async () => {
      const date = localDate(Date.now(), offset);
      try {
        const schedule = dailySchedule.parse(await services.loader.pack("daily.silhouette"));
        if (!schedule.days[date]) return live && setState({ kind: "unavailable" });
        const rows = await services.db.results.where("daily_date").equals(date).toArray();
        const done = rows
          .map((r) => gameResult.safeParse(r.data))
          .flatMap((p) =>
            p.success && p.data.game_id === "silhouette" && p.data.mode === "daily" ? [p.data] : [],
          )
          .sort((a, b) => a.ended_at.localeCompare(b.ended_at))[0];
        if (done) return live && setState({ kind: "done", date, result: done });
        const saved = await services.store.find(DAILY_GAME_ID);
        const resumable =
          !!saved && (saved.state as { config?: { date?: string } }).config?.date === date;
        if (live) setState({ kind: "ready", date, resumable });
      } catch {
        if (live) setState({ kind: "unavailable" });
      }
    })();
    return () => {
      live = false;
    };
  }, [services, offset]);

  return (
    <section className={styles.page}>
      <h1>{t("daily.title")}</h1>
      <Card className={styles.summary}>
        <h2>{t("daily.silhouette")}</h2>
        <p>{t("daily.silhouetteBody")}</p>
        {state.kind === "loading" && <p role="status">{t("daily.loading")}</p>}
        {state.kind === "unavailable" && (
          <>
            <p role="status">{t("daily.unavailable")}</p>
            <a className={styles.primary} href="/play/silhouette">
              {t("daily.keepPlaying")}
            </a>
          </>
        )}
        {state.kind === "ready" && (
          <a className={styles.primary} href="/play/silhouette/daily">
            {state.resumable ? t("daily.resume") : t("daily.play")}
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
    </section>
  );
}
