"use client";

import { useEffect } from "react";
import { reportError } from "../lib/observability/errors-client";
import { t } from "../lib/i18n";
import styles from "./page.module.css";

/**
 * A page that throws while rendering: a calm message, a retry and a way home instead of a blank screen. The error goes
 * to Sentry (when configured) with Next's digest, which matches the server log line.
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportError(error, error.digest ? { digest: error.digest } : {});
  }, [error]);
  return (
    <section className={styles.lost} role="alert">
      <div className={styles.lostText}>
        <p className="eyebrow">{t("error.eyebrow")}</p>
        <h1 className={styles.title}>{t("error.title")}</h1>
        <p className={styles.lede}>{t("error.body")}</p>
        <p className={styles.actions}>
          <button type="button" className={styles.primary} onClick={reset}>
            {t("error.retry")}
          </button>
          <a href="/" className={styles.secondary}>
            {t("notFound.home")} <span aria-hidden="true">→</span>
          </a>
        </p>
        {error.digest && (
          <p className={styles.lede}>{t("error.reference", { id: error.digest })}</p>
        )}
      </div>
    </section>
  );
}
