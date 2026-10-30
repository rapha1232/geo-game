"use client";

import { useEffect, useState } from "react";
import { Card } from "@meridian/ui";
import { POPULAR, buildCatalog, pickPlaySomething } from "../../lib/catalog/catalog";
import { browserOffsetMinutes, localDate } from "../../lib/daily/time";
import { LIBRARY } from "../../lib/quiz/library";
import { t } from "../../lib/i18n";
import { ContinueCard } from "../shell/ContinueCard";
import { useServices } from "../shell/StorageProvider";
import styles from "./home.module.css";

const GAMES = [
  { href: "/play/silhouette", title: "Silhouette", pitch: "Name the country from its outline." },
  {
    href: "/play/quiz",
    title: "Quiz Library",
    pitch: "Name them all, find them on the map, or choose.",
  },
];

/**
 * The Home page modules in the order of UX_AND_DESIGN §3.1: play now, continue, games, popular quizzes, then Today. The
 * daily is optional and never above the games (AC-PL-024).
 */
export function HomeModules() {
  const services = useServices();
  const [href, setHref] = useState("/play/silhouette");
  const [dailyDone, setDailyDone] = useState<boolean | null>(null);

  useEffect(() => {
    if (!services) return;
    let live = true;
    const date = localDate(Date.now(), browserOffsetMinutes());
    void services.db.results
      .where("daily_date")
      .equals(date)
      .toArray()
      .then((rows) => {
        if (live)
          setDailyDone(
            // A light shape check: the full result schema (zod) stays out of the Home bundle.
            rows.some((r) => {
              const d = r.data as { game_id?: unknown; mode?: unknown } | null;
              return d?.game_id === "silhouette" && d.mode === "daily";
            }),
          );
      })
      .catch(() => live && setDailyDone(false));
    return () => {
      live = false;
    };
  }, [services]);

  const items = buildCatalog(null);
  const popular = POPULAR.map((slug) => LIBRARY.find((q) => q.slug === slug)).filter((q) => !!q);
  return (
    <div className={styles.modules}>
      <section className={styles.hero}>
        <h1>{t("home.hero")}</h1>
        <p className={styles.lede}>{t("app.tagline")}</p>
        <a
          className={styles.cta}
          href={href}
          onClick={() => setHref(pickPlaySomething(items, Math.random).href)}
          onMouseEnter={() => setHref(pickPlaySomething(items, Math.random).href)}
          onFocus={() => setHref(pickPlaySomething(items, Math.random).href)}
        >
          <span aria-hidden="true">▶ </span>
          {t("home.playNow")}
        </a>
      </section>

      <ContinueCard />

      <section aria-labelledby="home-games">
        <h2 id="home-games">{t("home.games")}</h2>
        <ul className={styles.cards}>
          {GAMES.map((g) => (
            <li key={g.href}>
              <Card as="article" className={styles.card}>
                <h3>
                  <a href={g.href}>{g.title}</a>
                </h3>
                <p>{g.pitch}</p>
              </Card>
            </li>
          ))}
        </ul>
        <a href="/play">{t("home.allQuizzes")}</a>
      </section>

      <section aria-labelledby="home-popular">
        <h2 id="home-popular">{t("home.popular")}</h2>
        <ul className={styles.tiles}>
          {popular.map((q) => (
            <li key={q!.slug}>
              <a className={styles.tile} href={`/play/quiz/${q!.slug}`}>
                {q!.title}
              </a>
            </li>
          ))}
        </ul>
        <a href="/play/quiz">{t("home.practice")} ▸</a>
      </section>

      <section aria-labelledby="home-today">
        <h2 id="home-today">{t("home.today")}</h2>
        <p>
          <a href="/daily">{t("home.todaySil")}</a>{" "}
          <span>
            {dailyDone === null
              ? ""
              : dailyDone
                ? `✓ ${t("home.todayDone")}`
                : `○ ${t("home.todayOpen")}`}
          </span>
        </p>
      </section>
    </div>
  );
}
