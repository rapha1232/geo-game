"use client";

import { usePathname } from "next/navigation";
import { BRAND_NAME } from "../../lib/brand";
import { t, type MessageKey } from "../../lib/i18n";
import styles from "./shell.module.css";

const ITEMS: { href: string; label: MessageKey }[] = [
  { href: "/play", label: "nav.play" },
  { href: "/daily", label: "nav.daily" },
  { href: "/me", label: "nav.me" },
  { href: "/settings", label: "nav.settings" },
];

const isActive = (path: string, href: string) => path === href || path.startsWith(`${href}/`);

/** Top bar on every size; the same links become a bottom tab bar under 640 px (UX_AND_DESIGN §2). */
export function Nav() {
  const path = usePathname() ?? "/";
  const links = (
    <ul className={styles.links}>
      {ITEMS.map((i) => (
        <li key={i.href}>
          <a href={i.href} aria-current={isActive(path, i.href) ? "page" : undefined}>
            {t(i.label)}
          </a>
        </li>
      ))}
    </ul>
  );
  return (
    <header className={styles.header}>
      <a href="/" className={styles.brand}>
        {BRAND_NAME}
      </a>
      <nav aria-label={t("nav.main")} className={styles.nav}>
        {links}
      </nav>
    </header>
  );
}
