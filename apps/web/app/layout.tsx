import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@meridian/ui/styles";
import { BRAND_NAME } from "../lib/brand";
import { t } from "../lib/i18n";
import styles from "./layout.module.css";

export const metadata: Metadata = {
  title: BRAND_NAME,
  description: t("app.tagline"),
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className={styles.shell}>
          <main className={styles.main}>{children}</main>
          <footer className={styles.footer}>
            <div className={styles.footerInner}>
              <p>{t("footer.rights", { year: new Date().getFullYear(), brand: BRAND_NAME })}</p>
              <nav aria-label={t("footer.legalNav")} className={styles.legal}>
                <a href="/terms">{t("footer.terms")}</a>
                <a href="/privacy">{t("footer.privacy")}</a>
              </nav>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
