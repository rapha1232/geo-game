import { describe, expect, it } from "vitest";
import { activityCalendar } from "../lib/achievements/calendar";

describe("activity calendar (AC-PL-032)", () => {
  it("ends with the week holding today, Monday first, and marks later days as future", () => {
    // 2026-11-05 is a Thursday.
    const c = activityCalendar(["2026-11-02", "2026-11-05", "2026-10-30"], "2026-11-05", 2);
    expect(c.weeks).toHaveLength(2);
    expect(c.weeks[0]![0]!.date).toBe("2026-10-26");
    expect(c.weeks[1]![0]!.date).toBe("2026-11-02");
    expect(c.weeks[1]![6]!.date).toBe("2026-11-08");
    expect(c.weeks[1]!.map((d) => d.future)).toEqual([
      false,
      false,
      false,
      false,
      true,
      true,
      true,
    ]);
    expect(c.playedCount).toBe(3);
    expect(c.dayCount).toBe(11);
  });
  it("ignores days outside the window and never counts a future day as played", () => {
    const c = activityCalendar(["2020-01-01", "2026-11-07"], "2026-11-05", 1);
    expect(c.playedCount).toBe(0);
    expect(c.weeks[0]![5]).toEqual({ date: "2026-11-07", played: false, future: true });
  });
});
