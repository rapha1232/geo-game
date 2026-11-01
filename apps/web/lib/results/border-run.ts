import { configHash, elapsedMs } from "@meridian/game-kit";
import { gameResult, type GameResult } from "@meridian/schemas";
import { HINT_COST, roundPoints } from "@meridian/border-run";
import type { Session } from "../border-run/controller";

export const MAX_SCORE = 10;

/** The GameResult of a finished Border Run round. Practice rounds are recorded as `practice` and stay out of statistics. */
export function borderRunResult(
  s: Session,
  ctx: { id: string; contentVersion: string; endedAt: number },
): GameResult {
  const r = s.round;
  const activeMs = Math.round(elapsedMs(s.timer, ctx.endedAt));
  const startedAt = Math.min(s.startedAt, ctx.endedAt);
  const config = { region: s.config.region, route: s.config.route, crossings: s.config.crossings };
  return gameResult.parse({
    id: ctx.id,
    game_id: "border-run",
    mode: s.config.mode,
    config,
    config_hash: configHash(config),
    seed: s.seed,
    content_version: ctx.contentVersion,
    score: roundPoints(r),
    max_score: MAX_SCORE,
    outcome: r.status === "won" ? "solved" : r.gaveUp ? "gave_up" : "failed",
    items: [
      {
        item_id: "route",
        entity_id: r.a,
        status: r.status === "won" ? "correct" : "wrong",
        attempts: r.guesses.length,
        hints: r.hints.length,
        points: roundPoints(r),
        ms: activeMs,
      },
    ],
    meta: {
      from: r.a,
      to: r.b,
      m: r.m,
      hint_cost: HINT_COST,
      guesses: r.guesses.map((g) => ({
        entity_id: g.entityId,
        cls: g.cls,
        ...(g.viaHint ? { hint: true } : {}),
      })),
    },
    flags: {
      resumed: s.resumed,
      pauseCount: 0,
      assisted: r.hints.length > 0,
      guardRelaxed: s.guardRelaxed,
      attempt: 1,
    },
    started_at: new Date(startedAt).toISOString(),
    ended_at: new Date(ctx.endedAt).toISOString(),
    active_ms: Math.min(activeMs, Math.max(0, ctx.endedAt - startedAt) + 60_000),
  });
}
