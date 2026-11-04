"use client";

import { useEffect, type ReactNode } from "react";
import { t } from "../../lib/i18n";
import { GameArt, artFor, hueFor } from "../home/GameArt";
import g from "./game.module.css";

/**
 * Hands the screen to a game: while mounted, the site nav and footer step aside (`data-immersive` on <html>, as in a
 * quiz round) and the game bar is the only chrome. Restores the page on unmount.
 */
export function useImmersive(kind = "game"): void {
  useEffect(() => {
    const root = document.documentElement;
    root.dataset["immersive"] = kind;
    // A round opens at the top, even if the set-up screen was scrolled to reach Start.
    if (!navigator.userAgent.includes("jsdom")) window.scrollTo(0, 0);
    return () => {
      if (root.dataset["immersive"] === kind) delete root.dataset["immersive"];
    };
  }, [kind]);
}

/**
 * The game bar (UX_AND_DESIGN §5.5): back to all games, the game's art and name (the page h1), live stats as pills
 * and optional actions. Sticky, slim, glass.
 */
export function GameBar({
  title,
  href,
  meta,
  actions,
  backHref = "/play",
}: {
  title: string;
  /** The game's route: picks its art and identity hue. */
  href: string;
  meta?: ReactNode;
  actions?: ReactNode;
  backHref?: string;
}) {
  useImmersive();
  return (
    <header className={g.bar} data-hue={hueFor(href)}>
      <a href={backHref} className={g.back} aria-label={t("game.back")} title={t("game.back")}>
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M15 5l-7 7 7 7" />
        </svg>
      </a>
      <span className={g.barArt} aria-hidden="true">
        <GameArt name={artFor(href)} />
      </span>
      <h1 className={g.title}>{title}</h1>
      {meta && <p className={g.meta}>{meta}</p>}
      {actions && <div className={g.actions}>{actions}</div>}
    </header>
  );
}

/**
 * A game's title card: the set-up screen before a round. A dark stage with the game's art and hue glow, a huge
 * title and pitch, and the options in a glass panel with the Start button. Not immersive: the site nav stays.
 */
export function TitleCard({
  title,
  href,
  pitch,
  children,
}: {
  title: string;
  href: string;
  pitch?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={g.titleCard} data-hue={hueFor(href)}>
      <section className={`${g.titleStage} stage-dark`}>
        <div className={g.titleGlow} aria-hidden="true" />
        <div className={g.titleArt} aria-hidden="true">
          <GameArt name={artFor(href)} />
        </div>
        <div className={g.titleText}>
          <h1>{title}</h1>
          {pitch && <p className={g.pitch}>{pitch}</p>}
        </div>
      </section>
      <section className={g.setup} aria-label={t("game.setup")}>
        {children}
      </section>
    </div>
  );
}
