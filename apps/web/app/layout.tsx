import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import "@meridian/ui/styles";
import { themeInitScript } from "@meridian/ui";
import { ThemeSwitch } from "./ThemeSwitch";
import { Nav } from "../components/shell/Nav";
import { StorageProvider } from "../components/shell/StorageProvider";
import { SystemBanners } from "../components/shell/SystemBanners";
import { BRAND_NAME } from "../lib/brand";
import { t } from "../lib/i18n";
import styles from "./layout.module.css";

export const metadata: Metadata = {
  title: BRAND_NAME,
  description: t("app.tagline"),
};

export const viewport: Viewport = {
  colorScheme: "light dark",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // The CSP middleware passes a per-request nonce; the inline theme script must carry it (AC-PL-025).
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    // suppressHydrationWarning: the inline script may set data-theme on <html> before React hydrates.
    <html lang="en" suppressHydrationWarning>
      <head>
        {nonce && <meta name="csp-nonce" content={nonce} />}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <StorageProvider contentHost={process.env.NEXT_PUBLIC_CONTENT_HOST ?? ""}>
          <div className={styles.shell}>
            <Nav />
            <SystemBanners />
            <main className={styles.main}>{children}</main>
            <footer className={styles.footer}>
              <div className={styles.footerInner}>
                <p>{t("footer.rights", { year: new Date().getFullYear(), brand: BRAND_NAME })}</p>
                <ThemeSwitch />
                <nav aria-label={t("footer.legalNav")} className={styles.legal}>
                  <a href="/terms">{t("footer.terms")}</a>
                  <a href="/privacy">{t("footer.privacy")}</a>
                </nav>
              </div>
            </footer>
          </div>
        </StorageProvider>
      </body>
    </html>
  );
}
