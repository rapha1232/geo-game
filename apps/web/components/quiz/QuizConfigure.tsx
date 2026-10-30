"use client";

import { useState } from "react";
import { Button, Card } from "@meridian/ui";
import {
  ALLOWED_FORMATS,
  CONTINENT_NAMES,
  pbKey,
  timeLimitMs,
  type CountrySet,
  type Difficulty,
  type Format,
  type QuizConfig,
  type QuizWorld,
  type Scope,
} from "@meridian/quiz";
import { FORMAT_LABEL, formatClock, itemCount, type NamedQuiz } from "../../lib/quiz/library";
import { t, type MessageKey } from "../../lib/i18n";
import styles from "./quiz.module.css";

const SCOPES: { value: string; scope: Scope }[] = [
  { value: "world", scope: { kind: "world" } },
  ...Object.keys(CONTINENT_NAMES).map((id) => ({
    value: `continent:${id}`,
    scope: { kind: "continent", id } as Scope,
  })),
];
const scopeValue = (s: Scope): string => (s.kind === "world" ? "world" : `${s.kind}:${s.id}`);

export type QuizConfigureProps = {
  quiz: NamedQuiz;
  world: QuizWorld;
  initial: QuizConfig;
  /** The player's best for the current configuration, as a percentage, if any. */
  bestPercent: (key: string) => number | null;
  accessible: boolean;
  onAccessible: (v: boolean) => void;
  onStart: (config: QuizConfig) => void;
  onPractice: (config: QuizConfig) => void;
};

/** Pre-game panel (quiz-library §8.2): format, scope, set, items, timer, and more options. */
export function QuizConfigure({
  quiz,
  world,
  initial,
  bestPercent,
  accessible,
  onAccessible,
  onStart,
  onPractice,
}: QuizConfigureProps) {
  const [c, setC] = useState<QuizConfig>(initial);
  const formats = ALLOWED_FORMATS[c.template];
  const n = itemCount(world, c);
  const fixedScope =
    c.template === "continents.by-name" ||
    c.template === "regions.by-name" ||
    c.template === "countries.by-continent";
  const limit = formatClock(timeLimitMs(c.format, n));
  const key = pbKey(c, n);
  const best = key ? bestPercent(key) : null;
  const total = itemCount(world, { ...c, count: "all" });
  const sizes: ("all" | number)[] = ["all", ...[10, 20, 50].filter((v) => v < total)];
  return (
    <Card className={styles.configure}>
      <h1>{quiz.title}</h1>
      <fieldset className={styles.field}>
        <legend>{t("qz.format")}</legend>
        {formats.map((f: Format) => (
          <label key={f}>
            <input
              type="radio"
              name="format"
              checked={c.format === f}
              onChange={() => setC({ ...c, format: f })}
            />
            {FORMAT_LABEL[f]}
          </label>
        ))}
      </fieldset>
      {!fixedScope && (
        <div className={styles.fieldRow}>
          <label>
            {t("qz.config.scope")}
            <select
              value={scopeValue(c.scope)}
              onChange={(e) =>
                setC({
                  ...c,
                  scope: (SCOPES.find((s) => s.value === e.target.value) as (typeof SCOPES)[number])
                    .scope,
                })
              }
            >
              {SCOPES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.scope.kind === "world"
                    ? t("qz.scope.world")
                    : (CONTINENT_NAMES[(s.scope as { id: string }).id] ?? s.value)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("qz.config.set")}
            <select
              value={c.countrySet}
              onChange={(e) => setC({ ...c, countrySet: e.target.value as CountrySet })}
            >
              {(["sovereign-197", "un-193", "sovereign+territories"] as const).map((v) => (
                <option key={v} value={v}>
                  {t(`qz.set.${v}` as MessageKey)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("qz.config.items")}
            <select
              value={String(c.count)}
              onChange={(e) =>
                setC({ ...c, count: e.target.value === "all" ? "all" : Number(e.target.value) })
              }
            >
              {sizes.map((v) => (
                <option key={String(v)} value={String(v)}>
                  {v === "all"
                    ? t("qz.config.itemsAll", { n: itemCount(world, { ...c, count: "all" }) })
                    : String(v)}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <fieldset className={styles.field}>
        <legend>{t("qz.config.timer")}</legend>
        <label>
          <input
            type="radio"
            name="timer"
            checked={c.timed}
            onChange={() => setC({ ...c, timed: true })}
          />
          {t("qz.config.timed", { time: limit })}
        </label>
        <label>
          <input
            type="radio"
            name="timer"
            checked={!c.timed}
            onChange={() => setC({ ...c, timed: false })}
          />
          {t("qz.config.untimed")}
        </label>
      </fieldset>
      <details className={styles.more}>
        <summary>{t("qz.config.more")}</summary>
        <div className={styles.fieldRow}>
          <label>
            {t("qz.config.difficulty")}
            <select
              value={c.difficulty}
              onChange={(e) => setC({ ...c, difficulty: e.target.value as Difficulty })}
            >
              {(["easy", "normal", "hard"] as const).map((v) => (
                <option key={v} value={v}>
                  {t(`qz.diff.${v}` as MessageKey)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("qz.config.strictness")}
            <select
              value={c.strictness}
              onChange={(e) =>
                setC({ ...c, strictness: e.target.value as QuizConfig["strictness"] })
              }
            >
              {(["lenient", "standard", "strict"] as const).map((v) => (
                <option key={v} value={v}>
                  {t(`qz.strict.${v}` as MessageKey)}
                </option>
              ))}
            </select>
          </label>
          {c.format === "MAP_CLICK" && (
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={accessible}
                onChange={(e) => onAccessible(e.target.checked)}
              />
              {t("qz.config.accessible")}
            </label>
          )}
        </div>
      </details>
      <p className={styles.note}>{t("qz.items", { n })}</p>
      <div className={styles.row}>
        <Button variant="primary" onPress={() => onStart(c)}>
          {t("qz.start")}
        </Button>
        <Button onPress={() => onStart({ ...c, learn: true, timed: false })}>
          {t("qz.learn")}
        </Button>
        <Button onPress={() => onPractice(c)}>{t("qz.practice")}</Button>
        {best !== null && (
          <span className={styles.note}>{t("qz.yourBest", { pb: `${best}%` })}</span>
        )}
      </div>
    </Card>
  );
}
