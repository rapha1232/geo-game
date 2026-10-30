"use client";

import { useEffect, useState } from "react";
import { Button, Card } from "@meridian/ui";
import { challengeTotals, type Session } from "../../lib/silhouette/controller";
import {
  encodeSilhouetteChallenge,
  type SilhouetteChallengeConfig,
} from "../../lib/challenges/silhouette";
import { BRAND_NAME } from "../../lib/brand";
import { t } from "../../lib/i18n";
import styles from "./challenge.module.css";

export type ChallengeSummaryProps = {
  session: Session;
  config: SilhouetteChallengeConfig;
  contentVersion: string;
  origin: string;
  /** The player had already played this exact challenge. Said after the round, never before. */
  seenBefore?: boolean;
  /** Test seam. Defaults to `fetch`. */
  createShort?: (payload: string, contentVersion: string) => Promise<string | null>;
  writeClipboard?: (text: string) => Promise<void>;
};

async function defaultCreateShort(payload: string, contentVersion: string): Promise<string | null> {
  try {
    const res = await fetch("/api/v1/challenges", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game_id: "silhouette", payload, content_version: contentVersion }),
    });
    if (!res.ok) return null;
    return ((await res.json()) as { code: string }).code;
  } catch {
    return null;
  }
}

/** Challenge results: your total, the comparison with the sender, and a share link carrying your score (UX_AND_DESIGN §9). */
export function ChallengeSummary({
  session,
  config,
  contentVersion,
  origin,
  seenBefore = false,
  createShort = defaultCreateShort,
  writeClipboard = (text) => navigator.clipboard.writeText(text),
}: ChallengeSummaryProps) {
  const totals = challengeTotals(session);
  const n = session.challenge?.targets.length ?? 0;
  const them = session.challenge?.sc;
  const long = encodeSilhouetteChallenge({
    config,
    seed: session.seed,
    contentVersion,
    senderScore: totals.points,
  });
  const [short, setShort] = useState<string | null | undefined>(undefined);
  const [copy, setCopy] = useState<"idle" | "ok" | "failed">("idle");

  useEffect(() => {
    let live = true;
    void createShort(long, contentVersion).then((c) => live && setShort(c));
    return () => {
      live = false;
    };
  }, [long, contentVersion, createShort]);

  const link = `${origin}/c/${short ?? long}`;
  const text = t("ch.shareText", {
    brand: BRAND_NAME,
    n,
    points: totals.points,
    max: totals.max,
    link,
  });
  const verdict =
    them === undefined
      ? null
      : totals.points > them
        ? t("ch.compareWin", { you: totals.points, them })
        : totals.points === them
          ? t("ch.compareTie", { you: totals.points })
          : t("ch.compareLose", { you: totals.points, them });

  return (
    <Card className={styles.card}>
      <h2>{t("ch.resultsTitle")}</h2>
      <p className={styles.headline}>
        {t("ch.total", { points: totals.points, max: totals.max, solved: totals.solved, n })}
      </p>
      {verdict && <p role="status">{verdict}</p>}
      {seenBefore && <p className={styles.note}>{t("ch.seenBefore")}</p>}
      <h3>{t("ch.shareTitle")}</h3>
      <pre className={styles.share} aria-label={t("ch.shareTitle")}>
        {short === undefined ? text.replace(link, "…") : text}
      </pre>
      {short === null && <p className={styles.note}>{t("ch.shortUnavailable")}</p>}
      <div className={styles.actions}>
        <Button
          variant="primary"
          isDisabled={short === undefined}
          onPress={() => {
            writeClipboard(text).then(
              () => setCopy("ok"),
              () => setCopy("failed"),
            );
          }}
        >
          {t("ch.copy")}
        </Button>
        <a href="/play/silhouette">{t("ch.playAgain")}</a>
      </div>
      <p role="status" className={styles.note}>
        {copy === "ok" ? t("ch.copied") : copy === "failed" ? t("ch.copyFailed") : ""}
      </p>
    </Card>
  );
}
