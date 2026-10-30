import { z } from "zod";
import { isoDate } from "./ids";

/** Items per day by game (DATA_MODEL §2.8). */
export const DAILY_ITEMS_PER_DAY: Record<string, number> = {
  silhouette: 1,
  "fact-pin": 5,
  "deep-cut": 5,
  "border-run": 2,
};

/** `daily/<game>.json`: date → target IDs. */
export const dailySchedule = z
  .object({
    game: z.enum(["silhouette", "fact-pin", "deep-cut", "border-run"]),
    from: isoDate,
    to: isoDate,
    days: z.record(isoDate, z.array(z.string().min(1)).min(1)),
  })
  .superRefine((d, ctx) => {
    if (d.to < d.from) ctx.addIssue({ code: "custom", path: ["to"], message: "to is before from" });
    const per = DAILY_ITEMS_PER_DAY[d.game] as number;
    for (const [date, ids] of Object.entries(d.days)) {
      if (date < d.from || date > d.to)
        ctx.addIssue({ code: "custom", path: ["days", date], message: "date is outside from..to" });
      if (ids.length !== per)
        ctx.addIssue({
          code: "custom",
          path: ["days", date],
          message: `${d.game} needs ${per} item(s) per day, got ${ids.length}`,
        });
    }
    // Every date from..to must be present (no gaps).
    const start = new Date(`${d.from}T00:00:00Z`).getTime();
    const end = new Date(`${d.to}T00:00:00Z`).getTime();
    const expected = Math.round((end - start) / 86_400_000) + 1;
    if (expected > 0 && Object.keys(d.days).length !== expected) {
      ctx.addIssue({
        code: "custom",
        path: ["days"],
        message: `expected ${expected} days from ${d.from} to ${d.to}, got ${Object.keys(d.days).length}`,
      });
    }
  });
export type DailySchedule = z.infer<typeof dailySchedule>;
