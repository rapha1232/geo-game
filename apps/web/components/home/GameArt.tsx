import type { ReactNode } from "react";
import styles from "./GameArt.module.css";

/**
 * Small decorative illustrations, one per game, drawn from simple shapes (no imagery, nothing to license). They
 * use only theme tokens, so they follow light, dark and high-contrast modes. Parts tagged `data-move` animate on
 * card hover (see home.module.css / catalog.module.css). Always aria-hidden: the card text carries the meaning.
 */
export type ArtName =
  | "silhouette"
  | "quiz"
  | "fact-pin"
  | "border-run"
  | "rank-it"
  | "deep-cut"
  | "map"
  | "flag"
  | "type"
  | "choice"
  | "capital";

const land = {
  fill: "var(--color-land)",
  stroke: "var(--color-border-map)",
  strokeWidth: 1,
} as const;
const accent = "var(--color-accent)";
const ink = "var(--color-text)";

const ART: Record<ArtName, ReactNode> = {
  silhouette: (
    <>
      <path
        d="M34 22 L58 14 L80 26 L86 46 L74 70 L50 78 L30 66 L22 44 Z"
        fill="none"
        stroke={ink}
        strokeWidth="2"
        strokeDasharray="4 4"
        data-move="dash"
      />
      <path
        d="M38 28 L58 21 L76 31 L80 46 L70 64 L50 71 L34 61 L28 44 Z"
        fill={accent}
        opacity="0.9"
        data-move="breathe"
      />
    </>
  ),
  quiz: (
    <>
      {[0, 1, 2].map((r) =>
        [0, 1, 2].map((c) => (
          <rect
            key={`${r}${c}`}
            x={18 + c * 24}
            y={14 + r * 24}
            width="20"
            height="20"
            rx="5"
            fill={(r + c) % 3 === 0 ? accent : "var(--color-land)"}
            stroke="var(--color-border-map)"
            data-move={(r + c) % 2 ? "pop" : undefined}
          />
        )),
      )}
    </>
  ),
  "fact-pin": (
    <>
      <path d="M10 60 Q30 40 50 56 T92 50 L92 84 L10 84 Z" {...land} />
      <g data-move="drop">
        <path d="M54 50 L46 34 A10 10 0 1 1 62 34 Z" fill={accent} stroke={ink} strokeWidth="1.5" />
        <circle cx="54" cy="29" r="3.5" fill="var(--color-surface)" />
      </g>
      <ellipse cx="54" cy="54" rx="8" ry="2.5" fill={ink} opacity="0.2" />
    </>
  ),
  "border-run": (
    <>
      <path
        d="M18 66 L40 40 L62 56 L84 24"
        fill="none"
        stroke={accent}
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="6 6"
        data-move="march"
      />
      {[
        [18, 66],
        [40, 40],
        [62, 56],
        [84, 24],
      ].map(([x, y], i) => (
        <circle
          key={i}
          cx={x}
          cy={y}
          r={i === 0 || i === 3 ? 8 : 6}
          fill={i === 0 || i === 3 ? accent : "var(--color-land)"}
          stroke={ink}
          strokeWidth="1.5"
        />
      ))}
    </>
  ),
  "rank-it": (
    <>
      {[46, 34, 24, 14].map((h, i) => (
        <rect
          key={i}
          x={18 + i * 18}
          y={80 - h - 10}
          width="13"
          height={h + 10}
          rx="3"
          fill={i === 0 ? accent : "var(--color-land)"}
          stroke="var(--color-border-map)"
          data-move="grow"
        />
      ))}
    </>
  ),
  "deep-cut": (
    <>
      {[34, 24, 14].map((r, i) => (
        <circle
          key={r}
          cx="50"
          cy="48"
          r={r}
          fill="none"
          stroke={i === 2 ? accent : "var(--color-border-map)"}
          strokeWidth={i === 2 ? 3 : 1.5}
          data-move={i === 0 ? "spin" : undefined}
          strokeDasharray={i === 0 ? "3 5" : undefined}
        />
      ))}
      <circle cx="50" cy="48" r="5" fill={accent} data-move="breathe" />
    </>
  ),
  map: (
    <>
      <path d="M8 30 Q30 18 50 30 T92 28 L92 74 Q70 84 50 72 T8 74 Z" {...land} />
      <path d="M40 34 L56 30 L62 44 L52 58 L38 50 Z" fill={accent} data-move="breathe" />
    </>
  ),
  capital: (
    <>
      <path d="M8 34 Q30 22 50 34 T92 32 L92 78 Q70 88 50 76 T8 78 Z" {...land} />
      <g data-move="breathe">
        <circle
          cx="50"
          cy="52"
          r="13"
          fill="var(--color-surface)"
          stroke={accent}
          strokeWidth="2"
        />
        <path
          d="M50 43 L52.6 49 L59 49.4 L54 53.4 L55.7 59.6 L50 56.2 L44.3 59.6 L46 53.4 L41 49.4 L47.4 49 Z"
          fill={accent}
        />
      </g>
    </>
  ),
  flag: (
    <>
      <line x1="24" y1="16" x2="24" y2="84" stroke={ink} strokeWidth="3" strokeLinecap="round" />
      <path
        d="M24 18 Q44 10 58 20 T84 20 L84 50 Q70 42 58 50 T24 50 Z"
        fill={accent}
        data-move="wave"
      />
    </>
  ),
  type: (
    <>
      <rect
        x="12"
        y="36"
        width="76"
        height="28"
        rx="14"
        fill="var(--color-surface)"
        stroke="var(--color-border-map)"
      />
      <rect x="24" y="44" width="30" height="12" rx="3" fill="var(--color-land)" />
      <rect x="58" y="42" width="2.5" height="16" fill={accent} data-move="blink" />
    </>
  ),
  choice: (
    <>
      {[0, 1].map((r) =>
        [0, 1].map((c) => (
          <rect
            key={`${r}${c}`}
            x={16 + c * 36}
            y={20 + r * 32}
            width="32"
            height="26"
            rx="7"
            fill={r === 0 && c === 1 ? accent : "var(--color-land)"}
            stroke="var(--color-border-map)"
            data-move={r === 0 && c === 1 ? "pop" : undefined}
          />
        )),
      )}
    </>
  ),
};

export function GameArt({ name, className }: { name: ArtName; className?: string | undefined }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className ? `${styles.art} ${className}` : styles.art}
      aria-hidden="true"
      focusable="false"
      data-art={name}
    >
      {ART[name]}
    </svg>
  );
}

/** The art for a catalog href / format. */
export function artFor(href: string, format?: string): ArtName {
  if (href.includes("/silhouette")) return "silhouette";
  if (href.includes("/fact-pin")) return "fact-pin";
  if (href.includes("/border-run")) return "border-run";
  if (href.includes("/rank-it") || href.includes("populous") || href.includes("largest"))
    return "rank-it";
  if (href.includes("/deep-cut")) return "deep-cut";
  if (href.includes("flag")) return "flag";
  if (href.includes("capital")) return "capital";
  if (href.includes("countries-of") || href.includes("/subdivisions")) return "map";
  if (format === "Map" || href.includes("find-") || href.includes("on-the-map")) return "map";
  if (format === "Choice") return "choice";
  if (format === "Type") return "type";
  return "quiz";
}
