import type { ReactNode } from "react";
import { cx } from "./cx";
import styles from "./ProgressRing.module.css";

export type ProgressRingProps = {
  /** 0..1 */
  value: number;
  /** Shown in the centre, e.g. "72%". */
  label?: ReactNode;
  /** Small caption under the label. */
  caption?: ReactNode;
  /** Diameter: sm 76 px, md 104 px, lg 136 px. Buckets, not a number: a style attribute would be blocked by the CSP. */
  size?: "sm" | "md" | "lg";
  /** Ring colour: the accent by default, or a feedback colour. */
  tone?: "accent" | "correct" | "near" | "wrong";
  className?: string;
};

/**
 * A circular progress meter that draws itself in. Decorative: the same number must be in nearby text, so the ring
 * is hidden from assistive tech. A tick mark at the end of the arc keeps the value readable without colour.
 */
export function ProgressRing({
  value,
  label,
  caption,
  size = "md",
  tone = "accent",
  className,
}: ProgressRingProps) {
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const r = 44;
  const c = 2 * Math.PI * r;
  const angle = v * 2 * Math.PI;
  return (
    <div
      className={cx(styles.ring, className)}
      data-tone={tone}
      data-size={size}
      aria-hidden="true"
    >
      <svg viewBox="0 0 100 100">
        <g transform="rotate(-90 50 50)">
          <circle cx="50" cy="50" r={r} className={styles.track} />
          <circle
            cx="50"
            cy="50"
            r={r}
            className={styles.value}
            strokeDasharray={c}
            strokeDashoffset={c * (1 - v)}
          />
          {v > 0 && v < 1 && (
            <circle
              cx={50 + r * Math.cos(angle)}
              cy={50 + r * Math.sin(angle)}
              r="4"
              className={styles.tip}
            />
          )}
        </g>
      </svg>
      {(label !== undefined || caption !== undefined) && (
        <div className={styles.center}>
          {label !== undefined && <span className={styles.label}>{label}</span>}
          {caption !== undefined && <span className={styles.caption}>{caption}</span>}
        </div>
      )}
    </div>
  );
}
