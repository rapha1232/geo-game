"use client";

import { useCallback, useEffect, useState, type ComponentType } from "react";
import { t } from "../../lib/i18n";
import { NavIcon } from "./NavIcons";
import styles from "./shell.module.css";

type PaletteProps = { onClose: () => void };

/**
 * The header's search button and its keyboard shortcuts (⌘K / Ctrl+K, or "/" outside a text field). The palette
 * itself (and the catalog it searches) loads on first open, so it adds nothing to a page that never uses it.
 */
export function SearchTrigger() {
  const [Palette, setPalette] = useState<ComponentType<PaletteProps> | null>(null);
  const [open, setOpen] = useState(false);

  const show = useCallback(() => {
    setOpen(true);
    if (!Palette) void import("./CommandPalette").then((m) => setPalette(() => m.CommandPalette));
  }, [Palette]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        !!target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        show();
      } else if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        // A quiz round owns the keyboard; the shortcut stays off there.
        if (document.documentElement.hasAttribute("data-immersive")) return;
        e.preventDefault();
        show();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [show]);

  return (
    <>
      <button
        type="button"
        className={styles.searchButton}
        onClick={show}
        aria-haspopup="dialog"
        aria-label={t("search.openLong")}
      >
        <NavIcon name="search" />
        <span className={styles.searchLabel}>{t("search.open")}</span>
        <kbd className={styles.searchKbd} aria-hidden="true">
          ⌘K
        </kbd>
      </button>
      {open && Palette && <Palette onClose={() => setOpen(false)} />}
    </>
  );
}
