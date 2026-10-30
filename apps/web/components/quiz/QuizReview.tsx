"use client";

import { useMemo, useState } from "react";
import { Button, Card } from "@meridian/ui";
import { optionLabel, summarize, type QuizWorld } from "@meridian/quiz";
import { formatClock } from "../../lib/quiz/library";
import type { QuizSession } from "../../lib/quiz/session";
import type { PbOutcome } from "../../lib/quiz/results";
import { t, type MessageKey } from "../../lib/i18n";
import styles from "./quiz.module.css";

type Filter = "all" | "missed" | "spelling";

export type QuizReviewProps = {
  world: QuizWorld;
  session: QuizSession;
  /** Monotonic ms, for the time used. */
  now: number;
  pb: PbOutcome | null;
  saved: boolean;
  /** Missed items with a way to learn more. */
  onLearn?: (id: string) => void;
  onPlayAgain: () => void;
  onReplay: () => void;
  onPractice: () => void;
  onConfigure: () => void;
  /** Rendered above the table: the map with missed items hatched. */
  mapSlot?: React.ReactNode;
};

const statusKey = (it: QuizSession["state"]["items"][number]): MessageKey =>
  it.status === "correct"
    ? it.note
      ? (`qz.status.${it.note}` as MessageKey)
      : "qz.status.correct"
    : (`qz.status.${it.status}` as MessageKey);

/** Review (quiz-library §8.4): result, personal best, actions and a table of every item with a non-colour status. */
export function QuizReview({
  world,
  session,
  now,
  pb,
  saved,
  onLearn,
  onPlayAgain,
  onReplay,
  onPractice,
  onConfigure,
  mapSlot,
}: QuizReviewProps) {
  const s = session.state;
  const sum = summarize(s, now);
  const [filter, setFilter] = useState<Filter>("all");
  const template = s.quiz.config.template;
  const rows = useMemo(
    () =>
      s.items
        .map((it, i) => ({ it, q: s.quiz.items[i] as (typeof s.quiz.items)[number], i }))
        .filter(({ it }) =>
          filter === "all"
            ? true
            : filter === "missed"
              ? it.status !== "correct"
              : it.note === "spelling-corrected",
        ),
    [s, filter],
  );
  const label = (id: string): string =>
    world.byId.get(id)?.name ?? world.groupById.get(id)?.name ?? optionLabel(world, template, id);
  const why =
    s.endReason === "timeout"
      ? t("qz.reviewTimeout")
      : s.endReason === "give_up"
        ? t("qz.reviewGiveUp")
        : t("qz.reviewComplete");
  const learn = s.quiz.config.learn === true;
  const missedCount = sum.missed.length;

  return (
    <section className={styles.review}>
      <h1>{t("qz.review")}</h1>
      <Card className={styles.card}>
        {!learn && (
          <p className={styles.headline}>
            {t("qz.reviewResult", {
              points: Number.isInteger(sum.points) ? sum.points : sum.points.toFixed(2),
              total: sum.total,
              percent: sum.percent,
              time: formatClock(sum.usedMs),
            })}
          </p>
        )}
        <p>{why}</p>
        {pb?.isNew && (
          <p role="status">
            <span aria-hidden="true">▲ </span>
            {t("qz.newPb")}
            {pb.previous
              ? ` · ${t("qz.pbBefore", { pb: `${Math.round(pb.previous.score * 100)}%` })}`
              : ""}
          </p>
        )}
        {!saved && <p role="alert">{t("qz.saveFailed")}</p>}
        {session.notice && <p className={styles.note}>{session.notice}</p>}
        <div className={styles.row}>
          <Button variant="primary" onPress={onPlayAgain}>
            {t("qz.playAgain")}
          </Button>
          <Button onPress={onReplay}>{t("qz.replaySame")}</Button>
          <Button onPress={onPractice}>
            {missedCount > 0 ? t("qz.practiceN", { n: missedCount }) : t("qz.practice")}
          </Button>
          <Button variant="ghost" onPress={onConfigure}>
            {t("qz.changeSettings")}
          </Button>
        </div>
      </Card>
      {mapSlot}
      <div role="group" aria-label={t("qz.review")} className={styles.row}>
        {(["all", "missed", "spelling"] as const).map((f) => (
          <Button
            key={f}
            variant={filter === f ? "primary" : "secondary"}
            onPress={() => setFilter(f)}
            aria-pressed={filter === f}
          >
            {t(
              f === "all"
                ? "qz.filterAll"
                : f === "missed"
                  ? "qz.filterMissed"
                  : "qz.filterSpelling",
            )}
          </Button>
        ))}
      </div>
      {rows.length === 0 ? (
        <p>{t("qz.noRows")}</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">{t("qz.col.item")}</th>
              <th scope="col">{t("qz.col.answer")}</th>
              <th scope="col">{t("qz.col.status")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ it, q, i }) => (
              <tr key={q.id + i} data-status={it.status}>
                <th scope="row">{label(q.id)}</th>
                <td>{it.input ?? "—"}</td>
                <td>
                  {t(statusKey(it))}
                  {it.status !== "correct" && onLearn && (
                    <>
                      {" "}
                      <button
                        type="button"
                        className={styles.linkButton}
                        onClick={() => onLearn(q.id)}
                      >
                        Learn ▸
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
