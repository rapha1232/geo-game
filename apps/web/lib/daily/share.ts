import type { GameResult } from "@meridian/schemas";
import { proximityBar } from "@meridian/silhouette";
import { BRAND_NAME } from "../brand";

const ARROW: Record<string, string> = {
  N: "↑",
  NE: "↗",
  E: "→",
  SE: "↘",
  S: "↓",
  SW: "↙",
  W: "←",
  NW: "↖",
};

/**
 * Spoiler-free share text for a finished Silhouette daily (UX_AND_DESIGN §9): one proximity bar and arrow per guess,
 * then the outcome and follow-ups. It never names the answer or any guess.
 */
export function silhouetteShare(result: GameResult, link: string): string {
  const guesses = (result.meta?.guesses ?? []) as { proximity: number; sector?: string }[];
  const solved = result.outcome === "solved";
  const rows = guesses.map((g) =>
    `${proximityBar(g.proximity)} ${g.sector ? (ARROW[g.sector] ?? "") : "✓"}`.trim(),
  );
  const follow = result.items
    .filter((i) => i.item_id.startsWith("followup:"))
    .map((i) => `${i.item_id.slice("followup:".length)} ${i.status === "correct" ? "✓" : "✕"}`);
  const verdict = `${solved ? "✓" : "✕"} ${solved ? guesses.length : 6}/6`;
  return [
    `${BRAND_NAME} · Silhouette · ${result.daily_date ?? result.ended_at.slice(0, 10)}`,
    ...rows,
    [verdict, ...follow].join(" · "),
    link,
  ].join("\n");
}

/** Spoiler-free share text for a finished Fact Pin Daily 5: a bar and the points per fact, never the facts or places. */
export function factPinShare(result: GameResult, link: string): string {
  const pins = result.items.map((i) => Math.round(i.points ?? 0));
  const rating = (result.meta?.rating as string | undefined) ?? "";
  return [
    `${BRAND_NAME} · Fact Pin · ${result.daily_date ?? result.ended_at.slice(0, 10)}`,
    ...pins.map((p) => `${proximityBar(Math.round(p / 10))} ${p}`),
    `${result.score}/${result.max_score}${rating ? ` · ${rating}` : ""}`,
    link,
  ].join("\n");
}
