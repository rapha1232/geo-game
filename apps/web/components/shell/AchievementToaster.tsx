"use client";

import { useEffect, useState } from "react";
import { onUnlock, watchResults } from "../../lib/achievements/engine";
import { t } from "../../lib/i18n";
import { useServices } from "./StorageProvider";
import styles from "./shell.module.css";

/**
 * Watches for new results and announces a new badge right after the round (AC-PL-032). One polite live region, no
 * sound, and it clears itself.
 */
export function AchievementToaster() {
  const services = useServices();
  const [messages, setMessages] = useState<string[]>([]);

  useEffect(() => {
    if (!services) return;
    watchResults(services.db);
    return onUnlock((list) => {
      setMessages((m) => [...m, ...list.map((a) => t("ach.toast", { name: a.name }))].slice(-3));
      setTimeout(() => setMessages((m) => m.slice(1)), 8000);
    });
  }, [services]);

  if (messages.length === 0) return <div role="status" aria-live="polite" />;
  return (
    <div role="status" aria-live="polite" className={styles.toaster}>
      {messages.map((m, i) => (
        <p key={`${i}-${m}`} className={styles.toast}>
          <span aria-hidden="true">★</span> {m} <a href="/me/achievements">{t("ach.link")}</a>
        </p>
      ))}
    </div>
  );
}
