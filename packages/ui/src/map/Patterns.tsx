import styles from "./GameMap.module.css";

/**
 * Pattern fills for map feedback (UX_AND_DESIGN §5.2). Every state is a shape as well as a colour,
 * so correct, missed and near stay distinguishable in grayscale (AC-PL-008).
 */
export type PatternIds = { hatch: string; dots: string; cross: string; light: string };

export function Patterns({ ids }: { ids: PatternIds }) {
  return (
    <defs>
      <pattern
        id={ids.hatch}
        width="6"
        height="6"
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(45)"
      >
        <rect width="6" height="6" className={styles.patWrongBg} />
        <line x1="0" y1="0" x2="0" y2="6" className={styles.patWrongInk} strokeWidth="2.4" />
      </pattern>
      <pattern id={ids.dots} width="6" height="6" patternUnits="userSpaceOnUse">
        <rect width="6" height="6" className={styles.patNearBg} />
        <circle cx="3" cy="3" r="1.5" className={styles.patNearInk} />
      </pattern>
      <pattern
        id={ids.cross}
        width="7"
        height="7"
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(45)"
      >
        <rect width="7" height="7" className={styles.patLandBg} />
        <path d="M0 3.5H7M3.5 0V7" className={styles.patCrossInk} strokeWidth="1" />
      </pattern>
      <pattern
        id={ids.light}
        width="8"
        height="8"
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(45)"
      >
        <rect width="8" height="8" className={styles.patLandBg} />
        <line x1="0" y1="0" x2="0" y2="8" className={styles.patLightInk} strokeWidth="1" />
      </pattern>
    </defs>
  );
}
