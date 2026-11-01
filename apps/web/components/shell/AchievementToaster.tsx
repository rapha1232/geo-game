"use client";

import { useEffect, useState } from "react";
import { t } from "../../lib/i18n";
import { useServices } from "./StorageProvider";
import styles from "./shell.module.css";

/**
 * Watches for new results and announces a new badge right after the round (AC-PL-032). One polite live region, no
 * sound, and it clears itself. The achievement rules load after the page is interactive, so they stay out of the
 * shell bundle.
 */
export function AchievementToaster() {
  const services = useServices();
  const [messages, setMessages] = useState<string[]>([]);

  useEffect(() => {
    if (!services) return;
    let off: (() => void) | undefined;
    let live = true;
    void import("../../lib/achievements/engine").then(({ onUnlock, watchResults }) => {
      if (!live) return;
      watchResults(services.db);
      off = onUnlock((list) => {
        setMessages((m) => [...m, ...list.map((a) => t("ach.toast", { name: a.name }))].slice(-3));
        setTimeout(() => setMessages((m) => m.slice(1)), 8000);
      });
    });
    return () => {
      live = false;
      off?.();
    };
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
