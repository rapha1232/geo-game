import { configHash, elapsedMs } from "@meridian/game-kit";
import { gameResult, type GameResult } from "@meridian/schemas";
import { correctPairs } from "@meridian/rank-it";
import type { MeridianDb } from "../storage/db";
import { maxPoints, points, type Session } from "../rank-it/controller";

/** The personal-best key: the longest Higher/Lower streak per statistic, scope and difficulty (rank-it §6). */
export const pbKey = (s: Session): string | null =>
  s.round.kind === "higher-lower"
    ? `rank-it:higher-lower:${s.round.stat}:${s.config.scope}:${s.config.difficulty}`
    : null;

export function rankItResult(
  s: Session,
  ctx: { id: string; contentVersion: string; endedAt: number },
): GameResult {
  const r = s.round;
  const activeMs = Math.round(elapsedMs(s.timer, ctx.endedAt));
  const startedAt = Math.min(s.startedAt, ctx.endedAt);
  const config = { ...s.config, stat: r.stat };
  const key = pbKey(s);
  const score = points(s);
  const meta =
    r.kind === "order"
      ? {
          stat: r.stat,
          truth: r.truth,
          arrangement: r.arrangement,
          pairs: correctPairs(r.arrangement, r.truth),
          hint: r.hint !== null,
        }
      : r.kind === "top-picks"
        ? { stat: r.stat, truth: r.truth, picks: r.picks }
        : { stat: r.stat, streak: r.streak, entities: r.used };
  return gameResult.parse({
    id: ctx.id,
    game_id: "rank-it",
    mode: "unlimited",
    config,
    config_hash: configHash(config),
    ...(key ? { pb_key: key } : {}),
    seed: s.seed,
    content_version: ctx.contentVersion,
    score,
    max_score: maxPoints(s),
    outcome: "completed",
    items: [
      {
        item_id: r.kind,
        status: r.kind === "order" && score === 100 ? "correct" : "completed",
        points: score,
        hints: r.kind === "order" && r.hint ? 1 : 0,
        ms: activeMs,
      },
    ],
    meta,
    flags: {
      resumed: s.resumed,
      pauseCount: 0,
      assisted: r.kind === "order" && r.hint !== null,
      guardRelaxed: false,
      attempt: 1,
    },
    started_at: new Date(startedAt).toISOString(),
    ended_at: new Date(ctx.endedAt).toISOString(),
    active_ms: Math.min(activeMs, Math.max(0, ctx.endedAt - startedAt) + 60_000),
  });
}

/** Writes the result, the Repeat Guard history and, for Higher/Lower, the personal best when it is longer. */
export async function saveRankIt(
  db: MeridianDb,
  input: {
    result: GameResult;
    history?: { game_id: string; pool_key: string; target_ids: string[] };
  },
): Promise<{ saved: boolean; newBest: boolean }> {
  const key = input.result.pb_key ?? null;
  try {
    let newBest = false;
    await db.transaction("rw", ["results", "history", "pbs"], async () => {
      await db.results.put({
        id: input.result.id,
        game_id: input.result.game_id,
        ended_at: input.result.ended_at,
        ...(key ? { pb_key: key } : {}),
        data: input.result,
      });
      if (input.history) await db.history.put(input.history);
      if (key) {
        const prev = await db.pbs.get(key);
        if (!prev || input.result.score > prev.score) {
          await db.pbs.put({
            pb_key: key,
            result_id: input.result.id,
            score: input.result.score,
            active_ms: input.result.active_ms,
          });
          newBest = input.result.score > 0;
        }
      }
    });
    return { saved: true, newBest };
  } catch {
    return { saved: false, newBest: false };
  }
}

export async function loadBest(db: MeridianDb, key: string): Promise<number | null> {
  try {
    return (await db.pbs.get(key))?.score ?? null;
  } catch {
    return null;
  }
}
