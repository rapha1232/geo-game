import type { Metadata } from "next";
import type { ReactNode } from "react";
import { BRAND_NAME } from "../lib/brand";
import { t } from "../lib/i18n";

export const metadata: Metadata = {
  title: BRAND_NAME,
  description: t("app.tagline"),
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main>{children}</main>
        <footer>
          <p>{t("footer.rights", { year: new Date().getFullYear(), brand: BRAND_NAME })}</p>
          <nav aria-label="Legal">
            <a href="/terms">{t("footer.terms")}</a> · <a href="/privacy">{t("footer.privacy")}</a>
          </nav>
        </footer>
      </body>
    </html>
  );
}
