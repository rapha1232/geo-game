const DAY_MS = 86_400_000;

/** The player's calendar date (`YYYY-MM-DD`) for a moment, given their UTC offset in minutes. Dailies follow it (silhouette §11). */
export const localDate = (nowMs: number, offsetMinutes: number): string =>
  new Date(nowMs + offsetMinutes * 60_000).toISOString().slice(0, 10);

/** Milliseconds until the player's next local midnight. */
export function msToNextDay(nowMs: number, offsetMinutes: number): number {
  const local = nowMs + offsetMinutes * 60_000;
  return DAY_MS - (((local % DAY_MS) + DAY_MS) % DAY_MS);
}

/** "5 h 12 min", or "12 min" under an hour, "under a minute" at the very end. */
export function formatCountdown(ms: number): string {
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "under a minute";
  return min < 60
    ? `${min} min`
    : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")} min`;
}

/** Offset of the browser's current time zone, in minutes east of UTC. */
export const browserOffsetMinutes = (): number => -new Date().getTimezoneOffset();
