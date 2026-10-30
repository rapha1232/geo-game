"use client";

import { useEffect, useState } from "react";
import { Button, Card } from "@meridian/ui";
import { t } from "../../lib/i18n";
import type { SessionRecord } from "../../lib/storage/db";
import { useServices } from "./StorageProvider";
import styles from "./shell.module.css";

/** Home "Continue" card for sessions up to 7 days old (AC-PL-013). Renders nothing when there are none. */
export function ContinueCard() {
  const services = useServices();
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  useEffect(() => {
    let live = true;
    void services?.store.listResumable().then((r) => live && setSessions(r));
    return () => {
      live = false;
    };
  }, [services]);
  if (!services || sessions.length === 0) return null;
  return (
    <section aria-labelledby="continue-h" className={styles.continue}>
      <h2 id="continue-h">{t("continue.title")}</h2>
      {sessions.map((s) => (
        <Card key={s.game_id} className={styles.continueItem}>
          <div>
            <strong>{s.title}</strong>
            {s.progress && <span className={styles.muted}> · {s.progress}</span>}
          </div>
          <div className={styles.actions}>
            <a href={s.href} className={styles.primaryLink}>
              {t("continue.resume")}
            </a>
            <Button
              onPress={() => {
                void services.store
                  .discard(s.game_id)
                  .then(() => setSessions((cur) => cur.filter((c) => c.game_id !== s.game_id)));
              }}
            >
              {t("continue.discard")}
            </Button>
          </div>
        </Card>
      ))}
    </section>
  );
}
