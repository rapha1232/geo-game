"use client";

import { useEffect, useState } from "react";
import { Card } from "@meridian/ui";
import { parseShortCode } from "@meridian/game-kit";
import { resolveChallengeResponse } from "@meridian/schemas";
import { parseSilhouetteChallenge, type ParsedChallenge } from "../../lib/challenges/silhouette";
import { t } from "../../lib/i18n";
import styles from "./challenge.module.css";

type State =
  | { kind: "loading" }
  | { kind: "invalid" }
  | { kind: "offline" }
  | { kind: "ready"; long: string; parsed: ParsedChallenge };

/**
 * `/c/<code>`: a long code is decoded on the device (works offline); a short code is resolved through the API.
 * An unknown or malformed code shows the friendly invalid-link page (AC-PL-016).
 */
export function ChallengeLanding({ code }: { code: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let live = true;
    void (async () => {
      let long = code;
      const short = parseShortCode(code);
      if (short) {
        try {
          const res = await fetch(`/api/v1/challenges/${short}`);
          if (res.status === 404) return live && setState({ kind: "invalid" });
          if (res.status !== 200 && res.status !== 410)
            return live && setState({ kind: "offline" });
          long = resolveChallengeResponse.parse(await res.json()).payload;
        } catch {
          return live && setState({ kind: "offline" });
        }
      }
      try {
        const parsed = parseSilhouetteChallenge(long);
        if (live) setState({ kind: "ready", long, parsed });
      } catch {
        if (live) setState({ kind: "invalid" });
      }
    })();
    return () => {
      live = false;
    };
  }, [code]);

  return (
    <section className={styles.page}>
      {state.kind === "loading" && <p role="status">{t("ch.loading")}</p>}
      {state.kind === "offline" && <p role="alert">{t("ch.offline")}</p>}
      {state.kind === "invalid" && (
        <Card className={styles.card} role="alert">
          <h1>{t("ch.invalidTitle")}</h1>
          <p>{t("ch.invalidBody")}</p>
          <a className={styles.primary} href="/play/silhouette">
            {t("ch.playAgain")}
          </a>
        </Card>
      )}
      {state.kind === "ready" && (
        <Card className={styles.card}>
          <h1>{t("ch.landingTitle")}</h1>
          <p>{t("ch.landingBody", { n: state.parsed.config.n })}</p>
          {state.parsed.payload.sc !== undefined && (
            <p className={styles.headline}>
              {t("ch.beat", {
                score: state.parsed.payload.sc,
                max: state.parsed.config.n * (6 + state.parsed.config.f.length),
              })}
            </p>
          )}
          <a className={styles.primary} href={`/play/silhouette/challenge?c=${state.long}`}>
            {t("ch.start")}
          </a>
        </Card>
      )}
    </section>
  );
}
