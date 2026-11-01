import { configHash, elapsedMs } from "@meridian/game-kit";
import { gameResult, type GameResult } from "@meridian/schemas";
import { MAX_RUN_POINTS, provisional, total } from "@meridian/deep-cut";
import type { Session } from "../deep-cut/controller";

export function deepCutResult(
  s: Session,
  ctx: { id: string; contentVersion: string; endedAt: number },
): GameResult {
  const activeMs = Math.round(elapsedMs(s.timer, ctx.endedAt));
  const startedAt = Math.min(s.startedAt, ctx.endedAt);
  const config = { timer: s.config.timer, mode: s.config.mode };
  return gameResult.parse({
    id: ctx.id,
    game_id: "deep-cut",
    mode: s.config.mode === "run" ? "unlimited" : s.config.mode,
    config,
    config_hash: configHash(config),
    seed: s.seed,
    ...(s.config.mode === "daily" && s.config.date ? { daily_date: s.config.date } : {}),
    content_version: ctx.contentVersion,
    score: total(s.run),
    max_score: MAX_RUN_POINTS,
    outcome: "completed",
    items: s.run.prompts.map((p) => ({
      item_id: p.promptId,
      ...(p.answer ? { entity_id: p.answer } : {}),
      status: p.tier ?? (p.answer ? "invalid" : "skipped"),
      points: p.points,
    })),
    meta: {
      provisional: provisional(s.run),
      prompts: s.run.prompts.map((p) => ({
        prompt_id: p.promptId,
        answer: p.answer,
        tier: p.tier,
        timed_out: p.timedOut,
      })),
    },
    flags: {
      resumed: s.resumed,
      pauseCount: 0,
      assisted: s.run.mode === "practice",
      guardRelaxed: false,
      attempt: 1,
    },
    started_at: new Date(startedAt).toISOString(),
    ended_at: new Date(ctx.endedAt).toISOString(),
    active_ms: Math.min(activeMs, Math.max(0, ctx.endedAt - startedAt) + 60_000),
  });
}
