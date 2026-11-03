"use client";

import { useEffect, useRef, useState } from "react";
import { ProgressRing } from "@meridian/ui";
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
import { useScrollProgress } from "../shell/useScrollProgress";
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

const reducedMotion = () =>
  document.documentElement.dataset.motion === "reduce" ||
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The hero scene: a night Earth rises over the horizon as the page scrolls, the headline drifts away and the three
 * numbers take its place. While it is on screen the global nav turns dark to match.
 */
function HeroScene({
  pick,
  onReroll,
  count,
}: {
  pick: CatalogItem | null;
  onReroll: () => void;
  count: number;
}) {
  const ref = useRef<HTMLElement>(null);
  useScrollProgress(ref);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    // Dark while the hero is still under the nav bar.
    let frame = 0;
    const check = () => {
      frame = 0;
      if (el.getBoundingClientRect().bottom > 56) root.dataset.nav = "dark";
      else delete root.dataset.nav;
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };
    check();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
      delete root.dataset.nav;
    };
  }, []);
  const href = pick?.href ?? "/play/silhouette";
  return (
    <section ref={ref} className={styles.heroScene}>
      <div className={`${styles.heroStage} stage-dark`}>
        <div className={styles.stars} aria-hidden="true" />
        <div className={styles.stars2} aria-hidden="true" />
        <div className={styles.heroCopy}>
          <p className={styles.kicker}>Meridian</p>
          <h1>{twoTone(t("home.hero"))}</h1>
          <p className={styles.lede}>{t("app.tagline")}</p>
          <div className={styles.ctaRow}>
            <div className={styles.ctaGroup}>
              <a className={styles.cta} href={href}>
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
                onClick={onReroll}
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
        <div className={styles.planet}>
          <HeroGlobe />
        </div>
        <dl className={styles.heroStats}>
          <div>
            <dd>{COUNTRY_COUNT}</dd>
            <dt>{t("home.statCountries")}</dt>
          </div>
          <div>
            <dd>{count}</dd>
            <dt>{t("home.statQuizzes")}</dt>
          </div>
          <div>
            <dd>0</dd>
            <dt>{t("home.statAccounts")}</dt>
          </div>
        </dl>
        <p className={styles.scrollCue} aria-hidden="true">
          {t("home.scroll")}
        </p>
      </div>
    </section>
  );
}

type Panel = { href: string; title: string; pitch: string; format: string };

/**
 * The games reel: a pinned row of large panels that slides sideways as the page scrolls down (wide screens with
 * motion). Elsewhere it is a plain horizontal scroller. Tabbing into an off-screen panel scrolls it into view.
 */
function GamesReel({ games }: { games: Panel[] }) {
  const ref = useRef<HTMLElement>(null);
  const track = useRef<HTMLUListElement>(null);
  useScrollProgress(ref);
  useEffect(() => {
    const el = ref.current;
    const list = track.current;
    if (!el || !list) return;
    const measure = () => {
      const shift = Math.max(0, list.scrollWidth - window.innerWidth);
      el.style.setProperty("--shift", `${shift}px`);
      el.style.setProperty("--reel-h", `${shift + window.innerHeight}px`);
    };
    measure();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    ro?.observe(list);
    window.addEventListener("resize", measure);
    const onFocus = (e: FocusEvent) => {
      const pinned = getComputedStyle(el).getPropertyValue("--pinned").trim() === "1";
      if (!pinned || reducedMotion()) return;
      const item = (e.target as HTMLElement).closest("li");
      if (!item) return;
      const shift = Math.max(0, list.scrollWidth - window.innerWidth);
      const want = Math.min(shift, Math.max(0, item.offsetLeft - window.innerWidth * 0.1));
      const top = el.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: top + want, behavior: "instant" as ScrollBehavior });
    };
    list.addEventListener("focusin", onFocus);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
      list.removeEventListener("focusin", onFocus);
    };
  }, []);
  return (
    <section ref={ref} aria-labelledby="home-games" className={styles.reel}>
      <div className={styles.reelSticky}>
        <div className={styles.reelHead}>
          <h2 id="home-games" className={styles.sectionLabel}>
            {t("home.games")}
          </h2>
          <p className={styles.statement}>{t("home.gamesStatement")}</p>
          <p className={styles.statementSub}>{t("home.gamesSub")}</p>
        </div>
        <ul ref={track} className={styles.reelTrack}>
          {games.map((g, i) => (
            <li key={g.href}>
              <article
                className={`${styles.panel} stage-dark`}
                data-hue={hueFor(g.href)}
                data-tilt=""
              >
                <span className={styles.panelNum} aria-hidden="true" data-depth="1">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className={styles.panelArt} data-depth="2">
                  <GameArt name={g.href === "/play/quiz" ? "quiz" : artFor(g.href)} />
                </div>
                <div className={styles.panelText} data-depth="1">
                  <p className={styles.panelMeta}>{g.format}</p>
                  <h3>
                    <a href={g.href} className={styles.stretched}>
                      {g.title}
                    </a>
                  </h3>
                  <p>{g.pitch}</p>
                  <span className={styles.panelGo} aria-hidden="true">
                    {t("home.play")} <span>→</span>
                  </span>
                </div>
              </article>
            </li>
          ))}
        </ul>
      </div>
    </section>
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
  const games: Panel[] = [
    { ...silhouette, format: `${silhouette.format} · ${LENGTH_LABEL[silhouette.length]}` },
    QUIZ_LIBRARY,
    ...gameItems
      .filter((i) => i.href !== "/play/silhouette")
      .map((i) => ({ ...i, format: `${i.format} · ${LENGTH_LABEL[i.length]}` })),
  ];
  const quizzes = items.filter((i) => i.kind === "quiz" && !i.href.includes("/subdivisions/"));
  const doneCount = dailyDone ? DAILIES.filter((d) => dailyDone.has(d.id)).length : 0;

  return (
    <div className={styles.modules} data-fullbleed="">
      <HeroScene pick={pick} onReroll={reroll} count={items.length} />

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
                  {q.title}
                </a>
                <span className={styles.tickerSep} aria-hidden="true">
                  ✦
                </span>
              </li>
            )),
          )}
        </ul>
      </nav>

      <div className={styles.page}>
        <ContinueCard />
      </div>

      <GamesReel games={games} />

      <section aria-labelledby="home-popular" className={`${styles.page} ${styles.chapter}`}>
        <div className={styles.chapterHead}>
          <h2 id="home-popular" className={styles.sectionLabel}>
            {t("home.popular")}
          </h2>
          <p className={`${styles.statement} fx-reveal`}>{t("home.popularLede")}</p>
        </div>
        <ul className={styles.bento}>
          {popular.map((q, i) => (
            <li
              key={q!.slug}
              data-size={i === 0 ? "hero" : i === 1 || i === 4 ? "wide" : undefined}
            >
              <a
                className={styles.tile}
                href={`/play/quiz/${q!.slug}`}
                data-fx-card=""
                data-tilt=""
                data-hue={hueFor(`/play/quiz/${q!.slug}`)}
              >
                <span className={styles.tileGlow} aria-hidden="true" />
                <GameArt name={artFor(`/play/quiz/${q!.slug}`)} className={styles.tileArt} />
                <span className={styles.tileText} data-depth="1">
                  <span className={styles.tileTitle}>{q!.title}</span>
                  <span className={styles.tileGo} aria-hidden="true">
                    →
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
        <a href="/play/quiz" className={styles.more}>
          {t("home.practice")} <span aria-hidden="true">→</span>
        </a>
      </section>

      <div className={`${styles.page} ${styles.continents} fx-reveal`}>
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

      <section aria-labelledby="home-today" className={`${styles.page} ${styles.chapter}`}>
        <div className={styles.todayHead}>
          <div>
            <h2 id="home-today" className={styles.sectionLabel}>
              {t("home.today")}
            </h2>
            <p className={`${styles.statement} fx-reveal`}>{t("home.todayStatement")}</p>
          </div>
          <div className={styles.todayMeter}>
            <ProgressRing
              value={dailyDone === null ? 0 : doneCount / DAILIES.length}
              label={dailyDone === null ? "" : `${doneCount}/${DAILIES.length}`}
              size="sm"
              className={styles.todayRing ?? ""}
            />
            <p>
              {dailyDone === null
                ? " "
                : t("home.todayCount", { done: doneCount, total: DAILIES.length })}
            </p>
          </div>
        </div>
        <ul className={`${styles.lineup} fx-stagger`}>
          {DAILIES.map((d) => {
            const done = dailyDone?.has(d.id) ?? null;
            return (
              <li
                key={d.id}
                className={styles.today}
                data-fx-card=""
                data-tilt=""
                data-hue={hueFor(d.href)}
                data-done={done ? "" : undefined}
              >
                <span className={styles.todayGlow} aria-hidden="true" />
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
