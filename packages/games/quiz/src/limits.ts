import type { Format, QuizConfig } from "./types";

/** Seconds allowed per item (quiz-library §6.2). */
export const SECONDS_PER_ITEM: Record<Format, number> = {
  TYPE_ALL: 4,
  TYPE_PROMPTED: 9,
  MAP_CLICK: 6,
  MULTIPLE_CHOICE: 10,
};

/** `limit = ceil_to_15s(items × secondsPerItem)` in milliseconds. */
export function timeLimitMs(format: Format, items: number): number {
  return Math.ceil((items * SECONDS_PER_ITEM[format]) / 15) * 15 * 1000;
}

const scopeKey = (c: QuizConfig): string =>
  c.scope.kind === "world" ? "world" : `${c.scope.kind}:${c.scope.id}`;

/**
 * Personal-best key = `template | scope | format | countrySet | itemCount | timer` (quiz-library §6.1). A random subset
 * has no PB (a rolling average is shown instead), so it has no key either.
 */
export function pbKey(c: QuizConfig, itemCount: number): string | null {
  if (c.count !== "all" || c.learn) return null;
  return [
    c.template,
    scopeKey(c),
    c.format,
    c.countrySet,
    itemCount,
    c.timed ? "timed" : "untimed",
  ].join("|");
}

export type Pb = { score: number; activeMs: number };

/** A better score wins, and a tie goes to the shorter time. */
export function isNewPb(prev: Pb | undefined, next: Pb): boolean {
  if (!prev) return true;
  return next.score > prev.score || (next.score === prev.score && next.activeMs < prev.activeMs);
}
