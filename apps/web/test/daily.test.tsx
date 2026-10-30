// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dailySchedule, gameResult } from "@meridian/schemas";
import { DailyHub } from "../components/daily/DailyHub";
import { DailySummary } from "../components/daily/DailySummary";
import { ServicesContext } from "../components/shell/StorageProvider";
import { browserOffsetMinutes, formatCountdown, localDate, msToNextDay } from "../lib/daily/time";
import { silhouetteShare } from "../lib/daily/share";
import { MeridianDb } from "../lib/storage/db";
import { silhouetteResult } from "../lib/results/silhouette";
import { ulid } from "../lib/results/ulid";
import { answer, guess, newDailySession, next, pick } from "../lib/silhouette/controller";
import { world } from "./fixtures/mini-world";

afterEach(cleanup);

describe("local dates", () => {
  it("follow the player's offset, not UTC", () => {
    const t = Date.parse("2026-11-05T23:30:00Z");
    expect(localDate(t, 0)).toBe("2026-11-05");
    expect(localDate(t, 120)).toBe("2026-11-06");
    expect(localDate(t, -300)).toBe("2026-11-05");
  });
  it("counts down to the next local midnight", () => {
    const t = Date.parse("2026-11-05T23:30:00Z");
    expect(msToNextDay(t, 0)).toBe(30 * 60_000);
    expect(msToNextDay(t, 120)).toBe(22.5 * 3_600_000);
    expect([29_000, 30 * 60_000, 5 * 3_600_000 + 12 * 60_000].map(formatCountdown)).toEqual([
      "under a minute",
      "30 min",
      "5 h 12 min",
    ]);
  });
});

const dailyResult = (date: string, firstGuess = "Germany") => {
  let s = newDailySession(world, "20261105AB", "country:FRA", date, 1_000_000);
  s = guess(world, s, firstGuess, 1_005_000);
  s = pick(world, s, "country:ESP", 1_006_000);
  s = guess(world, s, "France", 1_010_000);
  s = answer(s, 0, s.followUps[0]!.prompt.correctIndex);
  s = answer(s, 1, (s.followUps[1]!.prompt.correctIndex + 1) % 4);
  return silhouetteResult(s, {
    id: ulid(1_000_000, new Uint8Array(16)),
    contentVersion: "2026.10.0",
    endedAt: 1_020_000,
  });
};

describe("daily session and result", () => {
  it("AC-SH-014: the daily target comes from the schedule, and a finished daily cannot be advanced", () => {
    const s = newDailySession(world, "20261105AB", "country:FRA", "2026-11-05");
    expect(s.round.targetId).toBe("country:FRA");
    expect(s.config).toMatchObject({ mode: "daily", date: "2026-11-05" });
    expect(newDailySession(world, "20261105AB", "country:FRA", "2026-11-05")).toEqual(s);
    let done = guess(world, s, "France");
    done = answer(done, 0, 0);
    done = answer(done, 1, 0);
    expect(done.phase).toBe("learn");
    expect(next(world, done)).toBe(done);
  });
  it("the result carries daily_date and validates (daily results require it)", () => {
    const r = dailyResult("2026-11-05");
    expect(gameResult.safeParse(r).success).toBe(true);
    expect(r).toMatchObject({
      mode: "daily",
      daily_date: "2026-11-05",
      outcome: "solved",
      flags: { attempt: 1 },
    });
  });
  it("practicing the daily shape records no daily", () => {
    const s = newDailySession(world, "20261105AB", "country:FRA", "2026-11-05", 0, "practice");
    expect(s.config.mode).toBe("practice");
    expect(s.round.mode).toBe("practice");
  });
});

describe("share text (UX_AND_DESIGN §9)", () => {
  const link = "https://meridian.example/daily";
  it("is spoiler-free: bars and arrows, the outcome and follow-ups, never a name", () => {
    const text = silhouetteShare(dailyResult("2026-11-05"), link);
    const lines = text.split("\n");
    expect(lines[0]).toBe("Meridian · Silhouette · 2026-11-05");
    expect(lines).toHaveLength(6);
    expect(lines[1]).toMatch(/^[▰▱]{10} [↑↗→↘↓↙←↖]$/);
    expect(lines[4]).toBe("✓ 3/6 · capital ✓ · flag ✕");
    expect(lines[5]).toBe(link);
    for (const name of ["France", "Germany", "Spain"]) expect(text).not.toContain(name);
  });
  it("shows a failure as ✕ 6/6", () => {
    const r = { ...dailyResult("2026-11-05"), outcome: "failed" as const };
    expect(silhouetteShare(r, link)).toContain("✕ 6/6");
  });
});

describe("DailySummary", () => {
  it("AC-PL-024: 'Keep playing: Unlimited' is the primary action and the next daily is counted down", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    render(
      <DailySummary
        result={dailyResult("2026-11-05")}
        link="https://x/daily"
        msToNext={5 * 3_600_000}
        writeClipboard={write}
      />,
    );
    const keep = screen.getByRole("link", { name: "Keep playing: Unlimited" });
    expect(keep).toHaveAttribute("href", "/play/silhouette");
    expect(screen.getByText("Next daily in 5 h 00 min")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Practice this shape" })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Copy result" }));
    expect(write).toHaveBeenCalledWith(
      expect.stringMatching(/^Meridian · Silhouette · 2026-11-05/),
    );
    expect(await screen.findByText("Copied to your clipboard.")).toBeInTheDocument();
  });
  it("says so when the clipboard is blocked", async () => {
    render(
      <DailySummary
        result={dailyResult("2026-11-05")}
        link="x"
        msToNext={1}
        writeClipboard={() => Promise.reject(new Error("no"))}
      />,
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "Copy result" }));
    expect(await screen.findByText(/Couldn't copy/)).toBeInTheDocument();
  });
});

describe("DailyHub", () => {
  const today = () => localDate(Date.now(), browserOffsetMinutes());
  const services = async (days: Record<string, string[]>, withResult: boolean) => {
    const db = new MeridianDb(`daily-${Math.random()}`);
    await db.open();
    if (withResult) {
      const r = dailyResult(today());
      await db.results.put({
        id: r.id,
        game_id: r.game_id,
        ended_at: r.ended_at,
        daily_date: today(),
        data: r,
      });
    }
    const schedule = dailySchedule.parse({
      game: "silhouette",
      from: Object.keys(days)[0],
      to: Object.keys(days)[0],
      days,
    });
    return {
      db,
      store: { find: async () => null },
      loader: { pack: async () => schedule },
      status: "ok",
      online: true,
    } as never;
  };

  it("offers today's Silhouette when it hasn't been played", async () => {
    const value = await services({ [today()]: ["country:FRA"] }, false);
    render(
      <ServicesContext.Provider value={value}>
        <DailyHub />
      </ServicesContext.Provider>,
    );
    expect(await screen.findByRole("link", { name: "Play today's Silhouette" })).toHaveAttribute(
      "href",
      "/play/silhouette/daily",
    );
  });
  it("AC-SH-014: reopening after completion shows the summary, not a new puzzle", async () => {
    const value = await services({ [today()]: ["country:FRA"] }, true);
    render(
      <ServicesContext.Provider value={value}>
        <DailyHub />
      </ServicesContext.Provider>,
    );
    expect(await screen.findByText("You've played today's Silhouette.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Play today's Silhouette" })).toBeNull();
    expect(screen.getByRole("link", { name: "Keep playing: Unlimited" })).toBeInTheDocument();
  });
  it("falls back to Unlimited when there is no schedule for today", async () => {
    const value = await services({ "2020-01-01": ["country:FRA"] }, false);
    render(
      <ServicesContext.Provider value={value}>
        <DailyHub />
      </ServicesContext.Provider>,
    );
    await waitFor(() =>
      expect(screen.getByText(/Today's daily isn't available/)).toBeInTheDocument(),
    );
    expect(screen.getByRole("link", { name: "Keep playing: Unlimited" })).toBeInTheDocument();
  });
});
