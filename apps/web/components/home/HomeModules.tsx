"use client";

import { useEffect, useState } from "react";
import { Card, ProgressRing } from "@meridian/ui";
import {
  POPULAR,
  buildCatalog,
  pickPlaySomething,
  type CatalogItem,
} from "../../lib/catalog/catalog";
import { browserOffsetMinutes, localDate } from "../../lib/daily/time";
import { LIBRARY } from "../../lib/quiz/library";
import { t } from "../../lib/i18n";
import { ContinueCard } from "../shell/ContinueCard";
import { useServices } from "../shell/StorageProvider";
import { HeroGlobe } from "./HeroGlobe";
import { GameArt, artFor, hueFor } from "./GameArt";
import styles from "./home.module.css";

const QUIZ_LIBRARY = {
  href: "/play/quiz",
  title: "Quiz Library",
  pitch: "Name them all, find them on the map, or choose.",
  format: "Type · Map · Choice",
};

/** Today's optional puzzles, in the order of the Daily hub. Each links straight to its daily. */
const DAILIES = [
  { id: "silhouette", href: "/play/silhouette/daily", label: "home.todaySil" },
  { id: "quiz", href: "/play/quiz/daily", label: "home.todayQuiz" },
  { id: "fact-pin", href: "/play/fact-pin/daily", label: "home.todayFactPin" },
  { id: "border-run", href: "/play/border-run/daily", label: "home.todayBorderRun" },
  { id: "deep-cut", href: "/play/deep-cut/daily", label: "home.todayDeepCut" },
] as const;

/** The six "Countries of <continent>" quizzes, for the continent strip. */
const CONTINENTS = [
  ["africa", "Africa"],
  ["asia", "Asia"],
  ["europe", "Europe"],
  ["north-america", "North America"],
  ["south-america", "South America"],
  ["oceania", "Oceania"],
] as const;

/** The default country set (DATA_AND_CONTENT §6): UN 193 + 4. */
const COUNTRY_COUNT = 197;

const LENGTH_LABEL: Record<CatalogItem["length"], string> = {
  short: "Under 2 min",
  medium: "2 to 5 min",
  long: "5 to 15 min",
  endless: "Endless",
};

/** Splits a two-sentence headline so the second sentence can take the gradient voice. */
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
  const items = buildCatalog(null);
  // The server renders a fixed pick; the client picks at random after mount (no hydration mismatch).
  const [pick, setPick] = useState<CatalogItem | null>(null);
  // The game ids with a daily result for today; null until IndexedDB answers.
  const [dailyDone, setDailyDone] = useState<Set<string> | null>(null);

  const reroll = () =>
    setPick((prev) => {
      let next = pickPlaySomething(items, Math.random);
      for (let i = 0; i < 4 && prev && next.href === prev.href; i++)
        next = pickPlaySomething(items, Math.random);
      return next;
    });

  useEffect(() => {
    setPick(pickPlaySomething(buildCatalog(null), Math.random));
  }, []);

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

  const popular = POPULAR.map((slug) => LIBRARY.find((q) => q.slug === slug)).filter((q) => !!q);
  const gameItems = items.filter((i) => i.kind === "game");
  const silhouette = gameItems.find((i) => i.href === "/play/silhouette")!;
  const games = [
    { ...silhouette, format: `${silhouette.format} · ${LENGTH_LABEL[silhouette.length]}` },
    QUIZ_LIBRARY,
    ...gameItems
      .filter((i) => i.href !== "/play/silhouette")
      .map((i) => ({ ...i, format: `${i.format} · ${LENGTH_LABEL[i.length]}` })),
  ];
  const quizzes = items.filter((i) => i.kind === "quiz" && !i.href.includes("/subdivisions/"));
  const doneCount = dailyDone ? DAILIES.filter((d) => dailyDone.has(d.id)).length : 0;
  const href = pick?.href ?? "/play/silhouette";

  return (
    <div className={styles.modules}>
      <section className={styles.hero}>
        <div className={styles.heroText}>
          <p className={styles.badgeRow}>
            <span className={styles.liveDot} aria-hidden="true" />
            <span>
              <strong>{COUNTRY_COUNT}</strong> {t("home.statCountries")}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              <strong>{items.length}</strong> {t("home.statQuizzes")}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              <strong>0</strong> {t("home.statAccounts")}
            </span>
          </p>
          <h1>{twoTone(t("home.hero"))}</h1>
          <p className={styles.lede}>{t("app.tagline")}</p>
          <div className={styles.ctaRow}>
            <div className={styles.ctaGroup}>
              <a className={styles.cta} href={href} data-hue={pick ? hueFor(pick.href) : undefined}>
                <span aria-hidden="true" className={styles.ctaIcon}>
                  <GameArt
                    name={pick ? artFor(pick.href) : "silhouette"}
                    hue={pick ? hueFor(pick.href) : "violet"}
                  />
                </span>
                <span className={styles.ctaText}>
                  <span>{t("home.playNow")}</span>
                  <small aria-live="polite">
                    {pick ? t("home.upNext", { title: pick.title }) : " "}
                  </small>
                </span>
              </a>
              <button
                type="button"
                className={styles.reroll}
                onClick={reroll}
                aria-label={t("home.reroll")}
                title={t("home.reroll")}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
                  <circle cx="8.5" cy="8.5" r="1.3" />
                  <circle cx="15.5" cy="15.5" r="1.3" />
                  <circle cx="12" cy="12" r="1.3" />
                </svg>
              </button>
            </div>
            <a className={styles.ctaGhost} href="/play">
              {t("home.allQuizzes")}
              <span aria-hidden="true" className={styles.ctaArrow}>
                →
              </span>
            </a>
          </div>
          <p className={styles.searchHint}>
            {t("home.searchHint", { key: "/" })
              .split("/")
              .flatMap((part, i) => (i === 0 ? [part] : [<kbd key={i}>/</kbd>, part]))}
          </p>
        </div>
        <div className={styles.globeStage}>
          <HeroGlobe />
          <div className={styles.chips} aria-hidden="true">
            <span className={styles.chip} data-kind="correct">
              <b>✓</b> {t("home.chip.correct")}
            </span>
            <span className={styles.chip} data-kind="near">
              <b>◐</b> {t("home.chip.near")}
            </span>
            <span className={styles.chip} data-kind="score">
              <b>★</b> {t("home.chip.streak")}
            </span>
          </div>
        </div>
      </section>

      <nav aria-label={t("home.ticker")} className={styles.ticker}>
        <ul className={styles.tickerTrack}>
          {[0, 1].map((copy) =>
            quizzes.map((q) => (
              <li key={`${copy}-${q.key}`} aria-hidden={copy === 1 ? true : undefined}>
                <a
                  href={q.href}
                  tabIndex={copy === 1 ? -1 : undefined}
                  data-hue={hueFor(q.href, q.format)}
                >
                  <span className={styles.tickerDot} aria-hidden="true" />
                  {q.title}
                </a>
              </li>
            )),
          )}
        </ul>
      </nav>

      <ContinueCard />

      <section aria-labelledby="home-games" className="fx-reveal">
        <div className={styles.sectionHead}>
          <h2 id="home-games">{t("home.games")}</h2>
          <p>{t("home.gamesLede")}</p>
        </div>
        <ul className={`${styles.bento} fx-stagger`}>
          {games.map((g, i) => (
            <li key={g.href} className={i < 2 ? styles.feature : undefined}>
              <Card as="article" className={styles.card} data-fx-card="" data-hue={hueFor(g.href)}>
                <div className={styles.artWell}>
                  <GameArt
                    name={g.href === "/play/quiz" ? "quiz" : artFor(g.href)}
                    className={styles.art}
                  />
                </div>
                <div className={styles.cardText}>
                  <p className={styles.cardMeta}>
                    <span className={styles.cardIndex} aria-hidden="true">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {g.format}
                  </p>
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
              <a
                className={styles.tile}
                href={`/play/quiz/${q!.slug}`}
                data-fx-card=""
                data-hue={hueFor(`/play/quiz/${q!.slug}`)}
              >
                <GameArt name={artFor(`/play/quiz/${q!.slug}`)} className={styles.tileArt} />
                <span>{q!.title}</span>
                <span className={styles.tileArrow} aria-hidden="true">
                  →
                </span>
              </a>
            </li>
          ))}
        </ul>
        <a href="/play/quiz" className={styles.more}>
          {t("home.practice")} <span aria-hidden="true">→</span>
        </a>
      </section>

      <div className={`${styles.continents} fx-reveal`}>
        <p className={styles.continentsHead}>
          <strong>{t("home.continents")}</strong> {t("home.continentsLede")}
        </p>
        <ul>
          {CONTINENTS.map(([slug, name]) => (
            <li key={slug}>
              <a href={`/play/quiz/countries-of-${slug}`}>{name}</a>
            </li>
          ))}
        </ul>
      </div>

      <section aria-labelledby="home-today" className={`${styles.todaySection} fx-reveal`}>
        <div className={styles.todayHead}>
          <ProgressRing
            value={dailyDone === null ? 0 : doneCount / DAILIES.length}
            label={dailyDone === null ? "" : `${doneCount}/${DAILIES.length}`}
            size="sm"
            className={styles.todayRing ?? ""}
          />
          <div>
            <h2 id="home-today">{t("home.today")}</h2>
            <p>
              {dailyDone === null
                ? " "
                : t("home.todayCount", { done: doneCount, total: DAILIES.length })}
            </p>
          </div>
        </div>
        <ul className={`${styles.todayList} fx-stagger`}>
          {DAILIES.map((d) => {
            const done = dailyDone?.has(d.id) ?? null;
            return (
              <li
                key={d.id}
                className={styles.today}
                data-fx-card=""
                data-hue={hueFor(d.href)}
                data-done={done ? "" : undefined}
              >
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
