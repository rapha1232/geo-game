"use client";

import { useEffect, useState } from "react";
import { Card } from "@meridian/ui";
import { POPULAR, buildCatalog, pickPlaySomething } from "../../lib/catalog/catalog";
import { browserOffsetMinutes, localDate } from "../../lib/daily/time";
import { LIBRARY } from "../../lib/quiz/library";
import { t } from "../../lib/i18n";
import { ContinueCard } from "../shell/ContinueCard";
import { useServices } from "../shell/StorageProvider";
import { HeroGlobe } from "./HeroGlobe";
import { GameArt, artFor } from "./GameArt";
import styles from "./home.module.css";

const QUIZ_LIBRARY = {
  href: "/play/quiz",
  title: "Quiz Library",
  pitch: "Name them all, find them on the map, or choose.",
};

/** Today's optional puzzles, in the order of the Daily hub. Each links straight to its daily. */
const DAILIES = [
  { id: "silhouette", href: "/play/silhouette/daily", label: "home.todaySil" },
  { id: "quiz", href: "/play/quiz/daily", label: "home.todayQuiz" },
  { id: "fact-pin", href: "/play/fact-pin/daily", label: "home.todayFactPin" },
  { id: "border-run", href: "/play/border-run/daily", label: "home.todayBorderRun" },
  { id: "deep-cut", href: "/play/deep-cut/daily", label: "home.todayDeepCut" },
] as const;

/** The default country set (DATA_AND_CONTENT §6): UN 193 + 4. */
const COUNTRY_COUNT = 197;

/** Splits a two-sentence headline so the second sentence can take the quieter voice. */
function twoTone(text: string) {
  const i = text.indexOf(". ");
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i + 1)} <em>{text.slice(i + 2)}</em>
    </>
  );
}

/**
 * The Home page modules in the order of UX_AND_DESIGN §3.1: play now, continue, games, popular quizzes, then Today. The
 * daily is optional and never above the games (AC-PL-024).
 */
export function HomeModules() {
  const services = useServices();
  const [href, setHref] = useState("/play/silhouette");
  // The game ids with a daily result for today; null until IndexedDB answers.
  const [dailyDone, setDailyDone] = useState<Set<string> | null>(null);

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
            new Set(
              rows.flatMap((r) => {
                const d = r.data as { game_id?: unknown; mode?: unknown } | null;
                return d?.mode === "daily" && typeof d.game_id === "string" ? [d.game_id] : [];
              }),
            ),
          );
      })
      .catch(() => live && setDailyDone(new Set()));
    return () => {
      live = false;
    };
  }, [services]);

  const items = buildCatalog(null);
  const popular = POPULAR.map((slug) => LIBRARY.find((q) => q.slug === slug)).filter((q) => !!q);
  const games = [
    items.find((i) => i.href === "/play/silhouette")!,
    QUIZ_LIBRARY,
    ...items.filter((i) => i.kind === "game" && i.href !== "/play/silhouette"),
  ].filter(Boolean);
  return (
    <div className={styles.modules}>
      <section className={styles.hero}>
        <div className={styles.heroText}>
          <p className="eyebrow">{t("home.eyebrow")}</p>
          <h1>{twoTone(t("home.hero"))}</h1>
          <p className={styles.lede}>{t("app.tagline")}</p>
          <div className={styles.ctaRow}>
            <a
              className={styles.cta}
              href={href}
              onClick={() => setHref(pickPlaySomething(items, Math.random).href)}
              onMouseEnter={() => setHref(pickPlaySomething(items, Math.random).href)}
              onFocus={() => setHref(pickPlaySomething(items, Math.random).href)}
            >
              <span aria-hidden="true" className={styles.ctaIcon}>
                ▶
              </span>
              {t("home.playNow")}
            </a>
            <a className={styles.ctaGhost} href="/play">
              {t("home.allQuizzes")}
              <span aria-hidden="true" className={styles.ctaArrow}>
                →
              </span>
            </a>
          </div>
          <dl className={styles.stats}>
            <div>
              <dt>{t("home.statCountries")}</dt>
              <dd>{COUNTRY_COUNT}</dd>
            </div>
            <div>
              <dt>{t("home.statQuizzes")}</dt>
              <dd>{items.length}</dd>
            </div>
            <div>
              <dt>{t("home.statAccounts")}</dt>
              <dd>0</dd>
            </div>
          </dl>
        </div>
        <HeroGlobe />
      </section>

      <ContinueCard />

      <section aria-labelledby="home-games" className="fx-reveal">
        <div className={styles.sectionHead}>
          <h2 id="home-games">{t("home.games")}</h2>
          <p>{t("home.gamesLede")}</p>
        </div>
        <ul className={`${styles.bento} fx-stagger`}>
          {games.map((g, i) => (
            <li key={g.href} className={i < 2 ? styles.feature : undefined}>
              <Card as="article" className={styles.card}>
                <GameArt
                  name={g.href === "/play/quiz" ? "quiz" : artFor(g.href)}
                  className={styles.art}
                />
                <div className={styles.cardText}>
                  <h3>
                    <a href={g.href} className={styles.stretched}>
                      {g.title}
                    </a>
                  </h3>
                  <p>{g.pitch}</p>
                </div>
                <span className={styles.arrow} aria-hidden="true">
                  →
                </span>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="home-popular" className="fx-reveal">
        <div className={styles.sectionHead}>
          <h2 id="home-popular">{t("home.popular")}</h2>
          <p>{t("home.popularLede")}</p>
        </div>
        <ul className={`${styles.tiles} fx-stagger`}>
          {popular.map((q) => (
            <li key={q!.slug}>
              <a className={styles.tile} href={`/play/quiz/${q!.slug}`} data-fx-card="">
                <GameArt name={artFor(`/play/quiz/${q!.slug}`)} className={styles.tileArt} />
                <span>{q!.title}</span>
              </a>
            </li>
          ))}
        </ul>
        <a href="/play/quiz" className={styles.more}>
          {t("home.practice")} <span aria-hidden="true">→</span>
        </a>
      </section>

      <section aria-labelledby="home-today" className="fx-reveal">
        <div className={styles.sectionHead}>
          <h2 id="home-today">{t("home.today")}</h2>
          <p>
            {dailyDone === null
              ? ""
              : t("home.todayCount", {
                  done: DAILIES.filter((d) => dailyDone.has(d.id)).length,
                  total: DAILIES.length,
                })}
          </p>
        </div>
        <ul className={`${styles.todayList} fx-stagger`}>
          {DAILIES.map((d) => {
            const done = dailyDone?.has(d.id) ?? null;
            return (
              <li key={d.id} className={styles.today} data-fx-card="">
                <GameArt name={artFor(d.href)} className={styles.todayArt} />
                <a href={d.href} className={styles.stretched}>
                  {t(d.label)}
                </a>
                <span className={styles.pill} data-done={done ? "" : undefined}>
                  {done === null
                    ? ""
                    : done
                      ? `✓ ${t("home.todayDone")}`
                      : `○ ${t("home.todayOpen")}`}
                </span>
              </li>
            );
          })}
        </ul>
        <a href="/daily" className={styles.more}>
          {t("home.todayAll")} <span aria-hidden="true">→</span>
        </a>
      </section>
    </div>
  );
}
