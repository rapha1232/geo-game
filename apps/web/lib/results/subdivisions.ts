import { configHash } from "@meridian/game-kit";
import { gameResult, type GameResult } from "@meridian/schemas";
import { subScore, type SubRound } from "@meridian/quiz";

export const subPbKey = (code: string, kind: SubRound["kind"]): string => `sub|${code}|${kind}`;

export function subdivisionResult(
  round: SubRound,
  ctx: { id: string; seed: string; contentVersion: string; startedAt: number; endedAt: number },
): GameResult {
  const config = {
    sub: round.country,
    format: round.kind === "sub-name" ? "TYPE_ALL" : "MAP_CLICK",
  };
  const items =
    round.kind === "sub-name"
      ? round.ids.map((id) => ({
          item_id: id,
          status: round.found.includes(id) ? "correct" : "missed",
        }))
      : round.order.map((id) => ({
          item_id: id,
          status: (round.scores[id] ?? 0) > 0 ? "correct" : "missed",
          points: round.scores[id] ?? 0,
        }));
  const ms = Math.max(0, ctx.endedAt - ctx.startedAt);
  return gameResult.parse({
    id: ctx.id,
    game_id: "quiz",
    mode: "untimed",
    config,
    config_hash: configHash(config),
    pb_key: subPbKey(round.country, round.kind),
    seed: ctx.seed,
    content_version: ctx.contentVersion,
    score: subScore(round),
    max_score: 100,
    outcome: round.status === "gave_up" ? "gave_up" : "completed",
    items,
    flags: { resumed: false, pauseCount: 0, assisted: false, guardRelaxed: false, attempt: 1 },
    started_at: new Date(ctx.startedAt).toISOString(),
    ended_at: new Date(ctx.endedAt).toISOString(),
    active_ms: ms,
  });
}
