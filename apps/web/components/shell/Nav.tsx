"use client";

import { usePathname } from "next/navigation";
import { BRAND_NAME } from "../../lib/brand";
import { t, type MessageKey } from "../../lib/i18n";
import { BrandMark, NavIcon } from "./NavIcons";
import { SearchTrigger } from "./SearchTrigger";
import styles from "./shell.module.css";

const ITEMS: { href: string; label: MessageKey; icon: Parameters<typeof NavIcon>[0]["name"] }[] = [
  { href: "/play", label: "nav.play", icon: "play" },
  { href: "/daily", label: "nav.daily", icon: "daily" },
  { href: "/explore", label: "nav.explore", icon: "explore" },
  { href: "/me", label: "nav.me", icon: "me" },
  { href: "/settings", label: "nav.settings", icon: "settings" },
];

const isActive = (path: string, href: string) => path === href || path.startsWith(`${href}/`);

/** Sticky top bar from 640 px up; the same links become an icon tab bar at the bottom of the phone (UX_AND_DESIGN §2). */
export function Nav() {
  const path = usePathname() ?? "/";
  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <a href="/" className={styles.brand}>
          <BrandMark />
          <span>{BRAND_NAME}</span>
        </a>
        <nav aria-label={t("nav.main")} className={styles.nav}>
          <ul className={styles.links}>
            {ITEMS.map((i) => (
              <li key={i.href}>
                <a href={i.href} aria-current={isActive(path, i.href) ? "page" : undefined}>
                  <NavIcon name={i.icon} />
                  <span>{t(i.label)}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <SearchTrigger />
      </div>
    </header>
  );
}
