import type { GameResult, TelemetryEvent } from "@meridian/schemas";

/** Rounds that teach rather than test never feed calibration. */
const SKIP_MODES = new Set(["practice", "practice-misses", "learn"]);
const SENT_GAMES = new Set(["quiz", "silhouette", "fact-pin"]);

/**
 * The anonymous answer events for one finished round (API_CONTRACTS §4.6, ARCHITECTURE §8.1). Only per-item outcomes
 * leave the device: which item, whether it was right and on which attempt. Nothing about the player, no free text.
 */
export function eventsFromResult(r: GameResult): TelemetryEvent[] {
  if (SKIP_MODES.has(r.mode) || !SENT_GAMES.has(r.game_id)) return [];
  const difficulty =
    typeof (r.config as { difficulty?: unknown }).difficulty === "string"
      ? String((r.config as { difficulty: string }).difficulty).slice(0, 20)
      : "normal";
  const out: TelemetryEvent[] = [];
  for (const item of r.items) {
    if (item.status === "skipped") continue;
    const id = item.entity_id ?? item.item_id;
    const followUp = item.item_id.startsWith("followup:");
    out.push({
      game_id: r.game_id,
      item_kind: followUp
        ? item.item_id.slice("followup:".length)
        : r.game_id === "silhouette"
          ? "shape"
          : r.game_id === "fact-pin"
            ? "fact"
            : "quiz_item",
      item_id: followUp ? (r.items[0]?.entity_id ?? id) : id,
      correct: item.status === "correct",
      attempt: Math.max(1, Math.min(20, item.attempts ?? 1)),
      difficulty_setting: difficulty,
      t: r.ended_at,
    });
  }
  return out;
}
