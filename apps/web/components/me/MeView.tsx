"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Card } from "@meridian/ui";
import type { GameResult } from "@meridian/schemas";
import { t, type MessageKey } from "../../lib/i18n";
import { formatDuration, history, overview, perGame, TREND_LENGTH } from "../../lib/results/stats";
import styles from "./me.module.css";

const gameName = (id: string): string => {
  const key = `me.game.${id}` as MessageKey;
  try {
    const v = t(key);
    return v === undefined ? id : v;
  } catch {
    return id;
  }
};
const outcomeName = (o: string): string => t(`me.outcome.${o}` as MessageKey);
const one = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** Inline sparkline with a text equivalent: the numbers are always available to screen readers. */
function Sparkline({ values }: { values: readonly number[] }) {
  if (values.length < 2)
    return (
      <span aria-label={t("me.trendLabel1", { list: values.map(one).join(", ") })}>
        {values.map(one).join(", ")}
      </span>
    );
  const max = Math.max(...values, 1);
  const w = 120;
  const h = 28;
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * w},${h - (v / max) * (h - 4) - 2}`)
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={styles.spark}
      role="img"
      aria-label={t(values.length === 1 ? "me.trendLabel1" : "me.trendLabel", {
        n: values.length,
        list: values.map(one).join(", "),
      })}
    >
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export type MeViewProps = {
  results: readonly GameResult[];
  /** The mastery map, built by the container (it needs the map packs). */
  masteryMap?: ReactNode;
  /** The player's UTC offset in minutes, for "active days". */
  offsetMinutes?: number;
  playHref?: string;
};

/** Profile body (UX_AND_DESIGN §3.5, §7.1): overview, per-game stats, mastery map and history. Pure over its props. */
export function MeView({
  results,
  masteryMap,
  offsetMinutes = 0,
  playHref = "/play/silhouette",
}: MeViewProps) {
  const [game, setGame] = useState("");
  const [outcome, setOutcome] = useState("");
  const ov = useMemo(() => overview(results, offsetMinutes), [results, offsetMinutes]);
  const games = useMemo(() => perGame(results), [results]);
  const list = useMemo(
    () =>
      history(results, {
        ...(game ? { gameId: game } : {}),
        ...(outcome ? { outcome: outcome as GameResult["outcome"] } : {}),
      }),
    [results, game, outcome],
  );

  if (results.length === 0)
    return (
      <section className={styles.page}>
        <h1>{t("me.title")}</h1>
        <p>{t("me.empty")}</p>
        <a href={playHref} className={styles.action}>
          {t("me.emptyAction")}
        </a>
      </section>
    );

  return (
    <section className={styles.page}>
      <h1>{t("me.title")}</h1>

      <section aria-labelledby="me-ov">
        <h2 id="me-ov">{t("me.overview")}</h2>
        <p className={styles.headline}>
          {ov.rounds === 1 ? t("me.round1") : t("me.rounds", { n: ov.rounds })}
        </p>
        <dl className={styles.stats}>
          <div>
            <dt>{t("me.activeDays")}</dt>
            <dd>{ov.activeDays}</dd>
          </div>
          <div>
            <dt>{t("me.timePlayed")}</dt>
            <dd>{formatDuration(ov.activeMs)}</dd>
          </div>
          <div>
            <dt>{t("me.gamesTried")}</dt>
            <dd>{ov.gamesTried}</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="me-pg">
        <h2 id="me-pg">{t("me.perGame")}</h2>
        {games.map((g) => (
          <Card key={g.gameId} className={styles.game}>
            <h3>{gameName(g.gameId)}</h3>
            <dl className={styles.stats}>
              <div>
                <dt>{t("me.roundsLabel")}</dt>
                <dd>{g.rounds}</dd>
              </div>
              <div>
                <dt>{t("me.solveRate")}</dt>
                <dd>{Math.round(g.solveRate * 100)}%</dd>
              </div>
              <div>
                <dt>{t("me.avgScore")}</dt>
                <dd>{one(Math.round(g.averageScore * 10) / 10)}</dd>
              </div>
              <div>
                <dt>{t("me.bestScore")}</dt>
                <dd>{one(g.bestScore)}</dd>
              </div>
              {g.averageGuesses !== null && (
                <div>
                  <dt>{t("me.avgGuesses")}</dt>
                  <dd>{one(Math.round(g.averageGuesses * 10) / 10)}</dd>
                </div>
              )}
              <div>
                <dt>
                  {g.trend.length === 1
                    ? t("me.trend1")
                    : t("me.trend", { n: Math.min(TREND_LENGTH, g.trend.length) })}
                </dt>
                <dd>
                  <Sparkline values={g.trend} />
                </dd>
              </div>
            </dl>
          </Card>
        ))}
      </section>

      {masteryMap && (
        <section aria-labelledby="me-mm">
          <h2 id="me-mm">{t("me.mastery")}</h2>
          <p className={styles.note}>{t("me.masteryNote")}</p>
          {masteryMap}
        </section>
      )}

      <section aria-labelledby="me-h">
        <h2 id="me-h">{t("me.history")}</h2>
        <div className={styles.filters}>
          <label>
            {t("me.filterGame")}
            <select value={game} onChange={(e) => setGame(e.target.value)}>
              <option value="">{t("me.filterAll")}</option>
              {games.map((g) => (
                <option key={g.gameId} value={g.gameId}>
                  {gameName(g.gameId)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("me.filterOutcome")}
            <select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
              <option value="">{t("me.filterAll")}</option>
              {["solved", "failed", "gave_up"].map((o) => (
                <option key={o} value={o}>
                  {outcomeName(o)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {list.length === 0 ? (
          <p>{t("me.historyEmpty")}</p>
        ) : (
          <ol className={styles.history}>
            {list.map((r) => (
              <li key={r.id}>
                <time dateTime={r.ended_at}>{r.ended_at.slice(0, 10)}</time>{" "}
                {t("me.historyItem", {
                  game: gameName(r.game_id),
                  outcome: outcomeName(r.outcome),
                  score: one(r.score),
                  max: one(r.max_score),
                })}
              </li>
            ))}
          </ol>
        )}
      </section>
    </section>
  );
}
