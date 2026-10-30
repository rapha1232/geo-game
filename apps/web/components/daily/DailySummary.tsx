"use client";

import { useState } from "react";
import { Button, Card } from "@meridian/ui";
import type { GameResult } from "@meridian/schemas";
import { formatCountdown } from "../../lib/daily/time";
import { factPinShare, silhouetteShare } from "../../lib/daily/share";
import { t, type MessageKey } from "../../lib/i18n";
import styles from "./daily.module.css";

export type DailySummaryProps = {
  result: GameResult;
  /** Challenge link to put in the share text. */
  link: string;
  /** Milliseconds until the next local midnight. */
  msToNext: number;
  /** Where "Keep playing" and "Practice this shape" go. */
  unlimitedHref?: string;
  /** Null hides the practice link (Fact Pin has none). */
  practiceHref?: string | null;
  /** Test seam: defaults to the browser clipboard. */
  writeClipboard?: (text: string) => Promise<void>;
};

/**
 * The finished daily: result, spoiler-free share text, a countdown, and "Keep playing" as the primary action. A daily
 * is never a dead end (AC-PL-024).
 */
export function DailySummary({
  result,
  link,
  msToNext,
  unlimitedHref = result.game_id === "fact-pin" ? "/play/fact-pin" : "/play/silhouette",
  practiceHref = result.game_id === "fact-pin" ? null : "/play/silhouette/daily?practice=1",
  writeClipboard = (text) => navigator.clipboard.writeText(text),
}: DailySummaryProps) {
  const [copy, setCopy] = useState<"idle" | "ok" | "failed">("idle");
  const fact = result.game_id === "fact-pin";
  const text = fact ? factPinShare(result, link) : silhouetteShare(result, link);
  return (
    <Card className={styles.summary}>
      <h2>{t(fact ? "daily.doneFactPin" : "daily.done")}</h2>
      <p>
        {t("daily.result", {
          outcome: t(`me.outcome.${result.outcome}` as MessageKey),
          score: result.score,
          max: result.max_score,
        })}
      </p>
      <h3>{t("daily.share")}</h3>
      <pre className={styles.share} aria-label={t("daily.share")}>
        {text}
      </pre>
      <div className={styles.actions}>
        <a className={styles.primary} href={unlimitedHref}>
          {fact ? t("daily.moreFacts") : t("daily.keepPlaying")}
        </a>
        <Button
          onPress={() => {
            writeClipboard(text).then(
              () => setCopy("ok"),
              () => setCopy("failed"),
            );
          }}
        >
          {t("daily.copy")}
        </Button>
        {practiceHref && <a href={practiceHref}>{t("daily.practice")}</a>}
      </div>
      <p role="status" className={styles.note}>
        {copy === "ok" ? t("daily.copied") : copy === "failed" ? t("daily.copyFailed") : ""}
      </p>
      <p className={styles.note}>{t("daily.next", { time: formatCountdown(msToNext) })}</p>
    </Card>
  );
}
