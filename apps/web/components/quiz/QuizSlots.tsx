"use client";

import { memo, useMemo } from "react";
import { CONTINENT_NAMES, type QuizItem, type QuizWorld } from "@meridian/quiz";
import type { QuizSession } from "../../lib/quiz/session";
import { t } from "../../lib/i18n";
import styles from "./quiz.module.css";
import "../../lib/messages/qz";

type Slot = { key: string; name: string; state: "empty" | "correct" | "missed" | "hint" };

/**
 * The answer board under the map for Type-all quizzes (UX_AND_DESIGN §5.4): one box per answer, grouped by
 * continent and sorted by name. A box stays blank until its answer is named, and every blank box is the same width,
 * so the board shows where the gaps are without hinting at a name or its length.
 */
export const QuizSlots = memo(function QuizSlots({
  world,
  session,
  itemName,
  dotsOnly,
  onDotsOnly,
}: {
  world: QuizWorld;
  session: QuizSession;
  itemName: (id: string) => string;
  /** "Dots for missed only", shown in the heading row when a handler is given. */
  dotsOnly?: boolean;
  onDotsOnly?: ((on: boolean) => void) | undefined;
}) {
  const s = session.state;
  const groups = useMemo(() => {
    const m = new Map<string, { name: string; slot: Slot }[]>();
    s.items.forEach((it, i) => {
      const id = (s.quiz.items[i] as QuizItem).id;
      const c = world.byId.get(id)?.continent ?? "";
      const name = itemName(id);
      const state: Slot["state"] =
        it.status === "correct"
          ? "correct"
          : it.status === "missed" || it.status === "revealed"
            ? "missed"
            : it.highlighted
              ? "hint"
              : "empty";
      const row = m.get(c) ?? [];
      row.push({ name, slot: { key: id, name, state } });
      m.set(c, row);
    });
    return [...m.entries()]
      .sort(([a], [b]) => (CONTINENT_NAMES[a] ?? a).localeCompare(CONTINENT_NAMES[b] ?? b))
      .map(([c, rows]) => ({
        continent: CONTINENT_NAMES[c] ?? t("qz.answersHeading"),
        slots: rows.sort((a, b) => a.name.localeCompare(b.name)).map((r) => r.slot),
      }));
  }, [s, world, itemName]);

  return (
    <section className={styles.slotsSection} aria-labelledby="quiz-slots-h">
      <div className={styles.slotsHead}>
        <div>
          <h2 id="quiz-slots-h">{t("qz.answersHeading")}</h2>
          <p className={styles.note}>{t("qz.answersNote")}</p>
        </div>
        {onDotsOnly && <DotToggle on={dotsOnly === true} onChange={onDotsOnly} />}
      </div>
      <ul className={styles.slotGroups} aria-label={t("qz.countsHeading")}>
        {groups.map((g) => {
          const done = g.slots.filter((x) => x.state === "correct" || x.state === "missed").length;
          return (
            <li key={g.continent} className={styles.slotGroup}>
              <h3 className={styles.slotGroupHead}>
                {g.continent}{" "}
                <strong>
                  {done}/{g.slots.length}
                </strong>
              </h3>
              <ul
                className={styles.slots}
                aria-label={t("qz.slotsAria", { continent: g.continent })}
              >
                {g.slots.map((x) =>
                  x.state === "empty" ? (
                    <li key={x.key} className={styles.slot} data-state="empty" aria-hidden="true" />
                  ) : x.state === "hint" ? (
                    <li key={x.key} className={styles.slot} data-state="hint">
                      <span aria-hidden="true">◆ </span>
                      {t("qz.slotHint")}
                    </li>
                  ) : (
                    <li key={x.key} className={styles.slot} data-state={x.state}>
                      <span aria-hidden="true">{x.state === "correct" ? "✓ " : "✕ "}</span>
                      <span className={styles.slotName}>{x.name}</span>
                    </li>
                  ),
                )}
              </ul>
            </li>
          );
        })}
      </ul>
    </section>
  );
});

/** The "Dots for missed only" switch, shared by the answer board and the map chip. */
export function DotToggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className={styles.dotToggle}>
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />
      {t("qz.missedDots")}
    </label>
  );
}
