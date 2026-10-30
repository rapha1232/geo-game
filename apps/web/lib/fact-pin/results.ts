import { elapsedMs } from "@meridian/game-kit";
import { summary, ratingOf } from "@meridian/fact-pin";
import { gameResult, type GameResult } from "@meridian/schemas";
import type { MeridianDb, PbRecord } from "../storage/db";
import { pbKeyOf, type FactSession } from "./session";

/** Points that count as "pinned": 800 or more (the Endless streak threshold, fact-pin §6.3). */
const near = (score: number) => (score >= 800 ? "correct" : score > 0 ? "near" : "wrong");

export function factPinResult(
  s: FactSession,
  ctx: { id: string; contentVersion: string; endedAt: number; now: number },
): GameResult {
  const sum = summary(s.run);
  const c = s.run.config;
  const active = Math.round(s.run.rounds.reduce((t, r) => t + elapsedMs(r.timer, ctx.now), 0));
  const startedAt = Math.min(s.startedWall, ctx.endedAt);
  const pbKey = s.kind === "run" ? pbKeyOf(c) : null;
  return gameResult.parse({
    id: ctx.id,
    game_id: "fact-pin",
    mode: s.kind,
    config: {
      categories: c.categories,
      eras: c.eras,
      timerSec: c.timerSec,
      difficulty: c.difficulty,
      runLength: c.runLength,
    },
    config_hash: pbKeyOf(c),
    ...(pbKey ? { pb_key: pbKey } : {}),
    seed: s.seed,
    ...(s.kind === "daily" && s.date ? { daily_date: s.date } : {}),
    content_version: ctx.contentVersion,
    score: sum.total,
    max_score: sum.max,
    outcome: "completed",
    items: s.run.rounds.flatMap((r) =>
      r.result
        ? [
            {
              item_id: r.factId,
              status: near(r.result.score),
              hints: r.hints.length,
              points: r.result.score,
              ms: Math.round(elapsedMs(r.timer, ctx.now)),
            },
          ]
        : [],
    ),
    meta: {
      rating: ratingOf(sum.total),
      pins: s.run.rounds.flatMap((r) =>
        r.result
          ? [
              {
                fact: r.factId,
                km: Math.round(r.result.distanceKm),
                ...(r.pin ? { lat: r.pin.lat, lon: r.pin.lon } : {}),
                ...(r.result.timedOut ? { timedOut: true } : {}),
              },
            ]
          : [],
      ),
    },
    flags: {
      resumed: s.resumed,
      pauseCount: 0,
      assisted: false,
      guardRelaxed: s.recycled,
      attempt: 1,
    },
    started_at: new Date(startedAt).toISOString(),
    ended_at: new Date(ctx.endedAt).toISOString(),
    active_ms: Math.min(active, Math.max(0, ctx.endedAt - startedAt) + 60_000),
  });
}

export type FactPbOutcome = { key: string; isNew: boolean; previous: PbRecord | undefined };

/** Writes the finished run: the result, the Repeat Guard history, and the personal best (best total, ties to the faster run). */
export async function saveFactRun(
  db: MeridianDb,
  input: { result: GameResult; history?: { pool_key: string; target_ids: string[] } },
): Promise<{ saved: boolean; pb: FactPbOutcome | null }> {
  const key = input.result.pb_key ?? null;
  try {
    let pb: FactPbOutcome | null = null;
    await db.transaction("rw", ["results", "history", "pbs"], async () => {
      await db.results.put({
        id: input.result.id,
        game_id: "fact-pin",
        ended_at: input.result.ended_at,
        ...(key ? { pb_key: key } : {}),
        ...(input.result.daily_date ? { daily_date: input.result.daily_date } : {}),
        data: input.result,
      });
      if (input.history) await db.history.put({ game_id: "fact-pin", ...input.history });
      if (key) {
        const prev = await db.pbs.get(key);
        const better =
          !prev ||
          input.result.score > prev.score ||
          (input.result.score === prev.score && input.result.active_ms < prev.active_ms);
        if (better)
          await db.pbs.put({
            pb_key: key,
            result_id: input.result.id,
            score: input.result.score,
            active_ms: input.result.active_ms,
          });
        pb = { key, isNew: better, previous: prev };
      }
    });
    return { saved: true, pb };
  } catch {
    return { saved: false, pb: null };
  }
}
