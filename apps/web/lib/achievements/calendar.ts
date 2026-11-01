const DAY_MS = 86_400_000;

export type CalendarDay = { date: string; played: boolean; future: boolean };

const dayNumber = (date: string): number => Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
const dateOf = (n: number): string => new Date(n * DAY_MS).toISOString().slice(0, 10);

/**
 * The activity calendar beside the opt-in streak (UX_AND_DESIGN §7.3): `weeks` columns of Monday-to-Sunday local days,
 * ending with the week that holds `today`. Days after today are marked `future`. Pure: `days` are local dates.
 */
export function activityCalendar(
  days: readonly string[],
  today: string,
  weeks = 12,
): { weeks: CalendarDay[][]; playedCount: number; dayCount: number } {
  const played = new Set(days);
  const t = dayNumber(today);
  // 1970-01-01 was a Thursday: (n + 3) % 7 is 0 on Mondays.
  const monday = t - ((t + 3) % 7);
  const start = monday - (weeks - 1) * 7;
  let playedCount = 0;
  let dayCount = 0;
  const out: CalendarDay[][] = [];
  for (let w = 0; w < weeks; w++) {
    const col: CalendarDay[] = [];
    for (let d = 0; d < 7; d++) {
      const n = start + w * 7 + d;
      const date = dateOf(n);
      const future = n > t;
      const was = !future && played.has(date);
      if (!future) dayCount += 1;
      if (was) playedCount += 1;
      col.push({ date, played: was, future });
    }
    out.push(col);
  }
  return { weeks: out, playedCount, dayCount };
}
