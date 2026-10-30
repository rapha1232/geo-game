// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DailySummary } from "../components/daily/DailySummary";
import { factPinShare } from "../lib/daily/share";
import type { GameResult } from "@meridian/schemas";

afterEach(cleanup);

const result = {
  id: "01JD0000000000000000000000",
  game_id: "fact-pin",
  mode: "daily",
  config: {},
  config_hash: "x",
  seed: "2026110100",
  daily_date: "2026-11-01",
  content_version: "2026.10.0",
  score: 3820,
  max_score: 5000,
  outcome: "completed",
  items: [
    { item_id: "fact:0001", status: "correct", points: 980 },
    { item_id: "fact:0002", status: "near", points: 640 },
    { item_id: "fact:0003", status: "wrong", points: 0 },
    { item_id: "fact:0004", status: "correct", points: 1000 },
    { item_id: "fact:0005", status: "near", points: 1200 - 800 },
  ],
  meta: { rating: "Sharp", pins: [{ fact: "fact:0001", km: 12, lat: 1, lon: 2 }] },
  flags: { resumed: false, pauseCount: 0, assisted: false, guardRelaxed: false, attempt: 1 },
  started_at: "2026-11-01T08:00:00.000Z",
  ended_at: "2026-11-01T08:05:00.000Z",
  active_ms: 300000,
} as unknown as GameResult;

describe("Fact Pin Daily 5", () => {
  it("share text has a bar and points per fact, the total and the link, and no fact or place", () => {
    const text = factPinShare(result, "https://meridian.example/daily");
    const lines = text.split("\n");
    expect(lines[0]).toBe("Meridian · Fact Pin · 2026-11-01");
    expect(lines).toHaveLength(8);
    expect(lines[1]).toMatch(/ 980$/);
    expect(lines[6]).toBe("3820/5000 · Sharp");
    expect(lines[7]).toBe("https://meridian.example/daily");
    expect(text).not.toMatch(/fact:|lat|km/);
  });

  it("the summary offers Endless as the primary action and no practice link", () => {
    render(<DailySummary result={result} link="https://x/daily" msToNext={3_600_000} />);
    expect(screen.getByRole("link", { name: "More facts: Endless" }).getAttribute("href")).toBe(
      "/play/fact-pin",
    );
    expect(screen.queryByRole("link", { name: "Practice this shape" })).toBeNull();
    expect(screen.getByText("You've played today's Daily 5.")).toBeTruthy();
  });
});
