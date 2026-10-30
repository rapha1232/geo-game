/**
 * Per entity per skill mastery (quiz-library §11.4):
 *   mastery = 0.7 × mastery + 0.3 × itemScore, initialized at 0.5.
 * Due date = now + interval; the interval doubles on a correct answer (1 d, 2 d, 4 d … up to 60 d) and
 * resets to 10 min on a miss. The previous interval is derived from `dueAt − lastSeenAt`, so the stored
 * record needs no extra field (DATA_MODEL §2.10). Times are epoch milliseconds.
 */
export type Mastery = {
  mastery: number;
  exposures: number;
  lastSeenAt: number;
  dueAt: number;
};

export const MASTERY_INITIAL = 0.5;
export const MASTERY_WEAK_BELOW = 0.6;
export const MIN_INTERVAL_MS = 10 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;
export const MAX_INTERVAL_MS = 60 * DAY_MS;

export function updateMastery(
  prev: Mastery | undefined,
  outcome: { itemScore: number; correct: boolean },
  now: number,
): Mastery {
  const score = Math.max(0, Math.min(1, outcome.itemScore));
  const base = prev?.mastery ?? MASTERY_INITIAL;
  const mastery = 0.7 * base + 0.3 * score;
  const prevInterval = prev ? Math.max(0, prev.dueAt - prev.lastSeenAt) : 0;
  const interval = !outcome.correct
    ? MIN_INTERVAL_MS
    : prevInterval < DAY_MS
      ? DAY_MS
      : Math.min(MAX_INTERVAL_MS, prevInterval * 2);
  return { mastery, exposures: (prev?.exposures ?? 0) + 1, lastSeenAt: now, dueAt: now + interval };
}

export const isWeak = (m: Mastery): boolean => m.mastery < MASTERY_WEAK_BELOW;
