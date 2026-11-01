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

/** Spoiler-free share text for the Deep Cut daily: one tier glyph per prompt and the total, never the prompts or answers. */
export function deepCutShare(result: GameResult, link: string): string {
  const glyph: Record<string, string> = {
    "deep-cut": "◆",
    deep: "●",
    sharp: "◕",
    solid: "◑",
    obvious: "◔",
  };
  const prompts = (result.meta?.prompts ?? []) as { tier: string | null }[];
  return [
    `${BRAND_NAME} · Deep Cut · ${result.daily_date ?? result.ended_at.slice(0, 10)}`,
    prompts.map((p) => (p.tier ? (glyph[p.tier] ?? "?") : "✕")).join(" "),
    `${result.score}/${result.max_score}`,
    link,
  ].join("\n");
}

/** Spoiler-free share text for the daily quiz: the quiz title, the score and the time, never the items. */
export function quizShare(result: GameResult, link: string, title: string): string {
  const pct = result.max_score > 0 ? Math.round((100 * result.score) / result.max_score) : 0;
  const secs = Math.round(result.active_ms / 1000);
  return [
    `${BRAND_NAME} · Daily Quiz · ${result.daily_date ?? result.ended_at.slice(0, 10)}`,
    title,
    `${pct}% · ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`,
    link,
  ].join("\n");
}

/**
 * Spoiler-free share text for a finished Border Run daily: one mark per guess (on route, close, off route) and the
 * verdict, never the countries.
 */
export function borderRunShare(result: GameResult, link: string): string {
  const guesses = (result.meta?.guesses ?? []) as { cls: string }[];
  const mark: Record<string, string> = { "on-route": "■", near: "◐", "off-route": "✕" };
  const solved = result.outcome === "solved";
  return [
    `${BRAND_NAME} · Border Run · ${result.daily_date ?? result.ended_at.slice(0, 10)}`,
    guesses.map((g) => mark[g.cls] ?? "?").join(" "),
    `${solved ? "✓" : "✕"} ${guesses.length} guesses · ${result.score}/${result.max_score}`,
    link,
  ].join("\n");
}

/** One short, spoiler-free line per daily for the combined share text. */
function bundleLine(result: GameResult): string {
  const solvedMark = result.outcome === "solved" ? "✓" : "✕";
  switch (result.game_id) {
    case "silhouette": {
      const n = ((result.meta?.guesses ?? []) as unknown[]).length;
      return `Silhouette ${solvedMark} ${result.outcome === "solved" ? n : 6}/6`;
    }
    case "quiz": {
      const pct = result.max_score > 0 ? Math.round((100 * result.score) / result.max_score) : 0;
      return `Daily Quiz ${pct}%`;
    }
    case "fact-pin":
      return `Fact Pin ${result.score}/${result.max_score}`;
    case "border-run": {
      const n = ((result.meta?.guesses ?? []) as unknown[]).length;
      return `Border Run ${solvedMark} ${n} guesses`;
    }
    case "deep-cut":
      return `Deep Cut ${result.score}/${result.max_score}`;
    default:
      return `${result.game_id} ${result.score}/${result.max_score}`;
  }
}

/**
 * Spoiler-free share text for every daily finished on one date, in the order given (the Daily hub's order), with the
 * count out of `total`. Like the single shares, it never names an answer.
 */
export function dailyBundleShare(
  results: readonly GameResult[],
  link: string,
  date: string,
  total: number,
): string {
  return [
    `${BRAND_NAME} · Daily · ${date}`,
    ...results.map(bundleLine),
    `${results.length}/${total} played`,
    link,
  ].join("\n");
}
