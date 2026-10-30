"use client";

import { useEffect, useState } from "react";
import { Button, Card } from "@meridian/ui";
import { DEFAULT_CHALLENGE, encodeSilhouetteChallenge } from "../../lib/challenges/silhouette";
import { t } from "../../lib/i18n";
import { useServices } from "../shell/StorageProvider";
import styles from "./challenge.module.css";

const newSeed = (): string => {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => "0123456789ABCDEFGHJKMNPQRSTVWXYZ"[b % 32]).join("");
};

/** Starts a challenge you play first and then share, carrying your score. */
export function ChallengeCreate() {
  const services = useServices();
  const [n, setN] = useState<5 | 10>(5);
  const [busy, setBusy] = useState(false);
  // Services exist only in the browser, so the button is enabled after mount: server HTML and first client render must agree.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <section className={styles.page}>
      <Card className={styles.card}>
        <h1>{t("ch.createTitle")}</h1>
        <p>{t("ch.createBody")}</p>
        <fieldset className={styles.options}>
          <legend>{t("ch.length")}</legend>
          {([5, 10] as const).map((v) => (
            <label key={v}>
              <input type="radio" name="n" checked={n === v} onChange={() => setN(v)} />
              {v}
            </label>
          ))}
        </fieldset>
        <Button
          variant="primary"
          isDisabled={!mounted || !services || busy}
          onPress={() => {
            if (!services) return;
            setBusy(true);
            void services.loader.manifest().then((m) => {
              const code = encodeSilhouetteChallenge({
                config: { ...DEFAULT_CHALLENGE, n },
                seed: newSeed(),
                contentVersion: m.current,
              });
              window.location.assign(`/play/silhouette/challenge?c=${code}`);
            });
          }}
        >
          {t("ch.createStart")}
        </Button>
      </Card>
    </section>
  );
}
