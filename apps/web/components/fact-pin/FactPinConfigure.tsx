"use client";

import { Button, Card } from "@meridian/ui";
import type { Difficulty, FactPinConfig } from "@meridian/fact-pin";
import { t, type MessageKey } from "../../lib/i18n";
import styles from "./fact-pin.module.css";

const label = (c: string): string => {
  const key = `fp.category.${c}` as MessageKey;
  try {
    return t(key) ?? c;
  } catch {
    return c;
  }
};

/** Pre-game panel (fact-pin §3): mode, categories, timer and difficulty. */
export function FactPinConfigure({
  config,
  categories,
  best,
  error,
  onChange,
  onStart,
}: {
  config: FactPinConfig;
  categories: readonly string[];
  /** Personal best for the current settings, as [score, max]. */
  best: [number, number] | null;
  error: boolean;
  onChange: (c: FactPinConfig) => void;
  onStart: () => void;
}) {
  const chosen = new Set(config.categories);
  const toggle = (c: string) => {
    const next = new Set(chosen);
    if (next.has(c)) next.delete(c);
    else next.add(c);
    // All chosen is the same as none chosen (every category).
    onChange({
      ...config,
      categories: next.size === categories.length ? [] : categories.filter((x) => next.has(x)),
    });
  };
  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1>{t("fp.title")}</h1>
      </header>
      <Card className={styles.card}>
        <p>{t("fp.intro")}</p>
        <fieldset className={styles.fieldset}>
          <legend>{t("fp.mode")}</legend>
          <div className={styles.options}>
            {(["run", "endless"] as const).map((m) => (
              <label key={m} className={styles.option}>
                <input
                  type="radio"
                  name="fp-mode"
                  checked={config.mode === m}
                  onChange={() => onChange({ ...config, mode: m, runLength: 5 })}
                />
                {t(`fp.mode.${m}` as MessageKey)}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className={styles.fieldset}>
          <legend>{t("fp.categories")}</legend>
          <div className={styles.options}>
            {categories.map((c) => (
              <label key={c} className={styles.option}>
                <input
                  type="checkbox"
                  checked={config.categories.length === 0 || chosen.has(c)}
                  onChange={() => {
                    if (config.categories.length === 0) {
                      onChange({ ...config, categories: categories.filter((x) => x !== c) });
                    } else toggle(c);
                  }}
                />
                {label(c)}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className={styles.fieldset}>
          <legend>{t("fp.timer")}</legend>
          <div className={styles.options}>
            {([0, 15, 30] as const).map((s) => (
              <label key={s} className={styles.option}>
                <input
                  type="radio"
                  name="fp-timer"
                  checked={config.timerSec === s}
                  onChange={() => onChange({ ...config, timerSec: s })}
                />
                {t(`fp.timer.${s}` as MessageKey)}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className={styles.fieldset}>
          <legend>{t("fp.difficulty")}</legend>
          <div className={styles.options}>
            {(["easy", "normal", "hard"] as Difficulty[]).map((d) => (
              <label key={d} className={styles.option}>
                <input
                  type="radio"
                  name="fp-difficulty"
                  checked={config.difficulty === d}
                  onChange={() => onChange({ ...config, difficulty: d })}
                />
                {t(`fp.difficulty.${d}` as MessageKey)}
              </label>
            ))}
          </div>
        </fieldset>
        {best && <p className={styles.note}>{t("fp.best", { score: best[0], max: best[1] })}</p>}
        {error && <p role="alert">{t("fp.notEnough")}</p>}
        <div className={styles.row}>
          <Button
            variant="primary"
            onPress={onStart}
            isDisabled={config.categories.length === 0 && categories.length === 0}
          >
            {t("fp.start")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
