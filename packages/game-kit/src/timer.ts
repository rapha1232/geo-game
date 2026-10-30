/**
 * Active-time timer (ARCHITECTURE §9.1). `now` is a monotonic millisecond clock
 * (performance.now()) supplied by the caller; wall-clock time is never used.
 */
export type Timer = { readonly elapsedMs: number; readonly runningSince: number | null };

export const newTimer = (): Timer => ({ elapsedMs: 0, runningSince: null });

export const startTimer = (t: Timer, now: number): Timer =>
  t.runningSince === null ? { elapsedMs: t.elapsedMs, runningSince: now } : t;

/** Pause on hidden, pagehide, Pause action, or the resume prompt. */
export const pauseTimer = (t: Timer, now: number): Timer =>
  t.runningSince === null
    ? t
    : { elapsedMs: t.elapsedMs + Math.max(0, now - t.runningSince), runningSince: null };

export const elapsedMs = (t: Timer, now: number): number =>
  t.runningSince === null ? t.elapsedMs : t.elapsedMs + Math.max(0, now - t.runningSince);

export const isRunning = (t: Timer): boolean => t.runningSince !== null;

/** Remaining time for a countdown; never negative. */
export const remainingMs = (t: Timer, now: number, limitMs: number): number =>
  Math.max(0, limitMs - elapsedMs(t, now));

/** Warning at 10% of the limit, minimum 10 s (UX_AND_DESIGN `TimerBadge`). */
export const inWarning = (t: Timer, now: number, limitMs: number): boolean =>
  remainingMs(t, now, limitMs) <= Math.max(10_000, limitMs * 0.1);

/**
 * Restore after a reload: the stored timer was paused by pagehide, but if the page died without
 * it, the running span is unknowable, so the timer comes back paused at its last known elapsed time.
 */
export const restoreTimer = (stored: { elapsedMs: number }): Timer => ({
  elapsedMs: Math.max(0, stored.elapsedMs),
  runningSince: null,
});
