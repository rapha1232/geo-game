"use client";

import { useEffect } from "react";
import "@meridian/ui/styles";
import { reportError } from "../lib/observability/errors-client";
import { t } from "../lib/i18n";
import styles from "./page.module.css";

/**
 * The root layout itself failed, so this replaces the whole document. Our own page, because Next's default ships an
 * inline <style> that the CSP blocks (AC-PL-025). No shell, no storage: just the message and a reload.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    reportError(error, { boundary: "global", ...(error.digest ? { digest: error.digest } : {}) });
  }, [error]);
  return (
    <html lang="en">
      <body>
        <main>
          <section className={styles.lost} role="alert">
            <div className={styles.lostText}>
              <p className="eyebrow">{t("error.eyebrow")}</p>
              <h1 className={styles.title}>{t("error.title")}</h1>
              <p className={styles.lede}>{t("error.body")}</p>
              <p className={styles.actions}>
                <a href="/" className={styles.primary}>
                  {t("error.retry")}
                </a>
              </p>
              {error.digest && (
                <p className={styles.lede}>{t("error.reference", { id: error.digest })}</p>
              )}
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
