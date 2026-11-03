"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
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
  // Tucks away while the page scrolls down (so it never sits over maps and controls), back on any scroll up.
  const [tucked, setTucked] = useState(false);
  useEffect(() => {
    // `peak` is the lowest point reached while tucked: the header returns after a deliberate scroll up (≥ 96 px),
    // not after the small adjustments the page makes on its own (scroll anchoring, a panel settling).
    let peak = window.scrollY;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const y = window.scrollY;
        if (y < 160) {
          setTucked(false);
          peak = y;
        } else if (y > peak) {
          if (y - peak > 8) setTucked(true);
          peak = y;
        } else if (peak - y >= 96) {
          setTucked(false);
          peak = y;
        }
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return (
    <header className={styles.header} data-tucked={tucked ? "" : undefined}>
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
