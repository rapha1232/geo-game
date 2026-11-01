"use client";

import { useEffect, useState } from "react";
import { ACHIEVEMENTS } from "../../lib/achievements/defs";
import { checkAchievements } from "../../lib/achievements/engine";
import type { AchievementRecord } from "../../lib/storage/db";
import { t } from "../../lib/i18n";
import { useServices } from "../shell/StorageProvider";
import styles from "./me.module.css";

/** `/me/achievements`: every badge with what it takes, and when it was unlocked. */
export function AchievementsPage() {
  const services = useServices();
  const [have, setHave] = useState<Map<string, AchievementRecord> | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!services) return;
    let live = true;
    void (async () => {
      try {
        // Catches anything earned before this version existed or while another tab was open.
        await checkAchievements(services.db);
        const rows = await services.db.achievements.toArray();
        if (live) setHave(new Map(rows.map((r) => [r.id, r])));
      } catch {
        if (live) setFailed(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [services]);

  if (failed) return <p role="alert">{t("ach.loadError")}</p>;
  if (!have) return <p role="status">{t("sil.loading")}</p>;
  return (
    <div className={styles.page}>
      <h1>{t("ach.title")}</h1>
      <p>{t("ach.intro")}</p>
      <p className={styles.note}>{t("ach.count", { n: have.size, total: ACHIEVEMENTS.length })}</p>
      <ul className={styles.badges}>
        {ACHIEVEMENTS.map((a) => {
          const rec = have.get(a.id);
          return (
            <li key={a.id} className={styles.badge} data-unlocked={!!rec}>
              <h2>
                <span aria-hidden="true">{rec ? "★" : "☆"}</span> {a.name}
              </h2>
              <p>{a.how}</p>
              <p className={styles.note}>
                {rec ? t("ach.unlocked", { date: rec.unlocked_at.slice(0, 10) }) : t("ach.locked")}
              </p>
            </li>
          );
        })}
      </ul>
      <a href="/me" className={styles.action}>
        {t("ach.back")}
      </a>
    </div>
  );
}
