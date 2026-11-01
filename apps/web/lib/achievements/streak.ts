const DAY_MS = 86_400_000;
export const PERIOD_DAYS = 14;
export const FREEZES_PER_PERIOD = 2;

const dayNumber = (date: string): number => Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY_MS);

export type Streak = { current: number; longest: number; freezes: number };

/**
 * The opt-in streak (UX_AND_DESIGN §7.3). The streak grows on each local day with at least one completed round in any
 * game. Every 14-day period (counted from the first day played) banks 2 freezes, up to 2 in hand; a missed day uses
 * one silently and keeps the streak, and with none left the streak starts over. Today never breaks a streak: it only
 * adds to it once a round is done. Pure: `days` are local dates (`YYYY-MM-DD`), `today` is the local date now.
 */
export function computeStreak(days: readonly string[], today: string): Streak {
  const played = new Set(days.filter((d) => d <= today));
  if (played.size === 0) return { current: 0, longest: 0, freezes: FREEZES_PER_PERIOD };
  const first = Math.min(...[...played].map(dayNumber));
  const last = dayNumber(today);
  let current = 0;
  let longest = 0;
  let freezes = 0;
  let period = -1;
  for (let d = first; d <= last; d++) {
    const p = Math.floor((d - first) / PERIOD_DAYS);
    if (p !== period) {
      period = p;
      freezes = Math.min(FREEZES_PER_PERIOD, freezes + FREEZES_PER_PERIOD);
    }
    const date = new Date(d * DAY_MS).toISOString().slice(0, 10);
    if (played.has(date)) {
      current += 1;
      longest = Math.max(longest, current);
    } else if (d === last) {
      // Today is still open: leave the streak as it is.
    } else if (freezes > 0) freezes -= 1;
    else current = 0;
  }
  return { current, longest, freezes };
}
