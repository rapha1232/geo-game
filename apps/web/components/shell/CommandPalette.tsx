"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  EMPTY_FILTER,
  POPULAR,
  buildCatalog,
  searchCatalog,
  type CatalogItem,
} from "../../lib/catalog/catalog";
import { t } from "../../lib/i18n";
import { GameArt, artFor, hueFor, type ArtName } from "../home/GameArt";
import { NavIcon } from "./NavIcons";
import styles from "./palette.module.css";

type Entry = {
  key: string;
  title: string;
  detail: string;
  href: string;
  art?: ArtName;
  icon?: Parameters<typeof NavIcon>[0]["name"];
};
type Group = { label: string; entries: Entry[] };

const PAGES: Entry[] = [
  { key: "page:daily", title: t("nav.daily"), detail: "/daily", href: "/daily", icon: "daily" },
  {
    key: "page:atlas",
    title: t("nav.explore"),
    detail: "/explore",
    href: "/explore",
    icon: "explore",
  },
  { key: "page:me", title: t("nav.me"), detail: "/me", href: "/me", icon: "me" },
  {
    key: "page:settings",
    title: t("nav.settings"),
    detail: "/settings",
    href: "/settings",
    icon: "settings",
  },
];

const toEntry = (i: CatalogItem): Entry => ({
  key: i.key,
  title: i.title,
  detail: i.pitch,
  href: i.href,
  art: i.href === "/play/quiz" ? "quiz" : artFor(i.href),
});

const MAX_QUIZZES = 8;

/**
 * Quick search over every game, quiz and main page. A modal <dialog> with a combobox: type to filter, arrows to move,
 * Enter to open. With no query it offers the games, the popular quizzes and the main pages.
 */
export function CommandPalette({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const items = useMemo(() => buildCatalog(null), []);

  const groups: Group[] = useMemo(() => {
    const query = q.trim();
    if (!query) {
      const popular = POPULAR.map((s) => items.find((i) => i.key === `quiz:${s}`)).filter(
        (i): i is CatalogItem => !!i,
      );
      return [
        { label: t("search.games"), entries: items.filter((i) => i.kind === "game").map(toEntry) },
        { label: t("search.quizzes"), entries: popular.map(toEntry) },
        { label: t("search.pages"), entries: PAGES },
      ];
    }
    const found = searchCatalog(
      items,
      { ...EMPTY_FILTER, search: query },
      {
        favorites: new Set(),
        played: new Map(),
      },
    );
    const lower = query.toLowerCase();
    return [
      { label: t("search.games"), entries: found.filter((i) => i.kind === "game").map(toEntry) },
      {
        label: t("search.quizzes"),
        entries: found
          .filter((i) => i.kind === "quiz")
          .slice(0, MAX_QUIZZES)
          .map(toEntry),
      },
      {
        label: t("search.pages"),
        entries: PAGES.filter((p) => p.title.toLowerCase().includes(lower)),
      },
    ].filter((g) => g.entries.length > 0);
  }, [q, items]);

  const flat = groups.flatMap((g) => g.entries);
  const current = flat[Math.min(active, flat.length - 1)];

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    const opener = document.activeElement as HTMLElement | null;
    if (!d.open) d.showModal();
    input.current?.focus();
    return () => {
      opener?.focus?.();
    };
  }, []);

  useEffect(() => setActive(0), [q]);

  useEffect(() => {
    if (!current) return;
    document.getElementById(`${listId}-${current.key}`)?.scrollIntoView({ block: "nearest" });
  }, [current, listId]);

  const go = (e: Entry | undefined) => {
    if (e) window.location.assign(e.href);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (flat.length ? (a + 1) % flat.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (flat.length ? (a - 1 + flat.length) % flat.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(current);
    }
  };

  let index = -1;
  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-label={t("search.title")}
      onClose={onClose}
      onClick={(e) => {
        // A click on the backdrop (the dialog box itself, outside the panel) closes it.
        if (e.target === dialog.current) dialog.current?.close();
      }}
    >
      <div className={styles.panel}>
        <div className={styles.field}>
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={styles.icon}>
            <circle cx="11" cy="11" r="6.5" />
            <path d="m20 20-4.2-4.2" />
          </svg>
          <input
            ref={input}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={current ? `${listId}-${current.key}` : undefined}
            aria-label={t("search.label")}
            placeholder={t("search.placeholder")}
            autoComplete="off"
            spellCheck={false}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <button
            type="button"
            className={styles.esc}
            onClick={() => dialog.current?.close()}
            aria-label={t("search.close")}
          >
            Esc
          </button>
        </div>
        <div className={styles.results}>
          <ul id={listId} role="listbox" aria-label={t("search.title")} className={styles.list}>
            {groups.map((g) => (
              <li key={g.label} role="presentation">
                <p className={styles.group} aria-hidden="true">
                  {g.label}
                </p>
                <ul role="presentation" className={styles.groupList}>
                  {g.entries.map((e) => {
                    index++;
                    const i = index;
                    const selected = current?.key === e.key;
                    return (
                      <li
                        key={e.key}
                        id={`${listId}-${e.key}`}
                        role="option"
                        aria-selected={selected}
                        className={styles.option}
                        onMouseMove={() => setActive(i)}
                        onClick={() => go(e)}
                      >
                        {e.art ? (
                          <GameArt name={e.art} className={styles.art} hue={hueFor(e.href)} />
                        ) : (
                          <span className={styles.pageIcon} aria-hidden="true">
                            {e.icon && <NavIcon name={e.icon} />}
                          </span>
                        )}
                        <span className={styles.text}>
                          <span className={styles.title}>{e.title}</span>
                          <span className={styles.detail}>{e.detail}</span>
                        </span>
                        <span className={styles.enter} aria-hidden="true">
                          ↵
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
          {flat.length === 0 && (
            <p className={styles.empty}>{t("search.empty", { q: q.trim() })}</p>
          )}
        </div>
        <p className={styles.keys} aria-hidden="true">
          {t("search.keys")}
        </p>
        <p className="visually-hidden" role="status">
          {q.trim() ? t("search.count", { n: flat.length }) : ""}
        </p>
      </div>
    </dialog>
  );
}
