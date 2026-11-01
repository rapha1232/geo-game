import { configHash, elapsedMs } from "@meridian/game-kit";
import { gameResult, type GameResult } from "@meridian/schemas";
import { MATCH_PAIRS } from "@meridian/quiz";
import { roundOutcome, roundPbKey, roundPoints, type RoundSession } from "./rounds";

/** The GameResult of a finished round quiz. Kept apart from `rounds.ts` so the catalog does not load the result schema. */
export function roundResult(
  s: RoundSession,
  ctx: { id: string; contentVersion: string; endedAt: number },
): GameResult {
  const r = s.round;
  const ms = Math.round(elapsedMs(s.timer, ctx.endedAt));
  const startedAt = Math.min(s.startedAt, ctx.endedAt);
  const lives = s.lives;
  const config = { round: s.slug, kind: r.kind, ...(lives !== undefined ? { lives } : {}) };
  const items =
    r.kind === "tiles"
      ? [
          ...r.correct.map((id) => ({
            item_id: id,
            entity_id: id,
            status: r.selected.includes(id) ? "correct" : "missed",
          })),
          ...r.selected
            .filter((id) => !r.correct.includes(id))
            .map((id) => ({ item_id: id, entity_id: id, status: "wrong" })),
        ]
      : [
          ...r.matched.map((id) => ({ item_id: id, entity_id: id, status: "correct" })),
          ...r.left
            .filter((id) => !r.matched.includes(id))
            .map((id) => ({ item_id: id, entity_id: id, status: "missed" })),
        ];
  return gameResult.parse({
    id: ctx.id,
    game_id: "quiz",
    mode: "untimed",
    config,
    config_hash: configHash(config),
    pb_key: roundPbKey(s.slug, lives),
    seed: s.seed,
    content_version: ctx.contentVersion,
    score: roundPoints(r),
    max_score: 100,
    outcome: roundOutcome(r),
    items: items.slice(0, 500),
    meta:
      r.kind === "match" ? { pairs: MATCH_PAIRS, mistakes: r.mistakes } : { tiles: r.tiles.length },
    flags: { resumed: s.resumed, pauseCount: 0, assisted: false, guardRelaxed: false, attempt: 1 },
    started_at: new Date(startedAt).toISOString(),
    ended_at: new Date(ctx.endedAt).toISOString(),
    active_ms: Math.min(ms, Math.max(0, ctx.endedAt - startedAt) + 60_000),
  });
}
