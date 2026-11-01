import { t } from "../lib/i18n";
import styles from "./page.module.css";

/** A compass whose needle hunts for north. Decorative. */
function LostCompass() {
  const ticks = Array.from({ length: 24 }, (_, i) => {
    const a = (i / 24) * 2 * Math.PI;
    const r1 = i % 6 === 0 ? 34 : 38;
    return (
      <line
        key={i}
        x1={50 + r1 * Math.sin(a)}
        y1={50 - r1 * Math.cos(a)}
        x2={50 + 42 * Math.sin(a)}
        y2={50 - 42 * Math.cos(a)}
      />
    );
  });
  return (
    <svg viewBox="0 0 100 100" className={styles.compass} aria-hidden="true" focusable="false">
      <circle cx="50" cy="50" r="46" className={styles.compassFace} />
      <g className={styles.compassTicks}>{ticks}</g>
      <text x="50" y="22" className={styles.compassN}>
        N
      </text>
      <g className={styles.needle}>
        {/* At rest the needle points the wrong way (132°); the animation hunts back to north. */}
        <g transform="rotate(132 50 50)">
          <path d="M50 18 L56 50 L50 54 L44 50 Z" className={styles.needleN} />
          <path d="M50 82 L56 50 L50 46 L44 50 Z" className={styles.needleS} />
        </g>
        <circle cx="50" cy="50" r="3.5" className={styles.hub} />
      </g>
    </svg>
  );
}

// Our own 404: the framework default ships an inline <style>, which the CSP (AC-PL-025) rightly blocks.
export default function NotFound() {
  return (
    <section className={styles.lost}>
      <LostCompass />
      <div className={styles.lostText}>
        <p className="eyebrow">{t("notFound.eyebrow")}</p>
        <h1 className={styles.title}>{t("notFound.title")}</h1>
        <p className={styles.lede}>{t("notFound.body")}</p>
        <p className={styles.actions}>
          <a href="/" className={styles.primary}>
            {t("notFound.home")}
          </a>
          <a href="/play" className={styles.secondary}>
            {t("notFound.play")} <span aria-hidden="true">→</span>
          </a>
        </p>
      </div>
    </section>
  );
}
