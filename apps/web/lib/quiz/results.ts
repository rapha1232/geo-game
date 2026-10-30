import { configHash, updateMastery, type Mastery } from "@meridian/game-kit";
import { gameResult, type GameResult } from "@meridian/schemas";
import { isNewPb, masteryOutcomes, pbKey, summarize, type QuizState } from "@meridian/quiz";
import type { MasteryRecord, MeridianDb, PbRecord } from "../storage/db";

export type QuizKind = "normal" | "practice";

/** The GameResult of a finished quiz (DATA_MODEL §2.9). Learn mode records views only, with score 0. */
export function quizResult(
  s: QuizState,
  ctx: {
    id: string;
    contentVersion: string;
    seed: string;
    kind: QuizKind;
    resumed: boolean;
    endedAt: number;
    startedAt: number;
    /** Monotonic ms now, for the active time. */
    now: number;
  },
): GameResult {
  const c = s.quiz.config;
  const sum = summarize(s, ctx.now);
  const mode = c.learn
    ? "learn"
    : ctx.kind === "practice"
      ? "practice-misses"
      : c.timed
        ? "timed"
        : "untimed";
  const key = ctx.kind === "practice" ? null : pbKey(c, s.quiz.items.length);
  const activeMs = Math.min(sum.usedMs, Math.max(0, ctx.endedAt - ctx.startedAt) + 60_000);
  return gameResult.parse({
    id: ctx.id,
    game_id: "quiz",
    mode,
    config: JSON.parse(JSON.stringify(c)) as Record<string, unknown>,
    config_hash: configHash(c),
    ...(key ? { pb_key: key } : {}),
    seed: ctx.seed,
    content_version: ctx.contentVersion,
    score: sum.points,
    max_score: sum.total,
    outcome:
      s.endReason === "timeout" ? "timeout" : s.endReason === "give_up" ? "gave_up" : "completed",
    items: s.items.slice(0, 500).map((it, i) => ({
      item_id: s.quiz.items[i]?.id as string,
      ...(/^(country|territory):/.test(s.quiz.items[i]?.id ?? "")
        ? { entity_id: s.quiz.items[i]?.id as string }
        : {}),
      ...(it.input ? { input: it.input.slice(0, 200) } : {}),
      status: it.status === "correct" ? (it.note ?? "correct") : it.status,
      attempts: it.attempts,
      hints: it.hints + (it.highlighted ? 1 : 0),
      points: it.score,
    })),
    meta: { percent: sum.percent, missed: sum.missed.length },
    flags: {
      resumed: ctx.resumed,
      pauseCount: 0,
      assisted: false,
      guardRelaxed: false,
      attempt: 1,
    },
    started_at: new Date(Math.min(ctx.startedAt, ctx.endedAt)).toISOString(),
    ended_at: new Date(ctx.endedAt).toISOString(),
    active_ms: activeMs,
  });
}

const iso = (ms: number): string => new Date(ms).toISOString();

/** Per-entity mastery updates from a finished quiz. */
export function quizMastery(
  s: QuizState,
  previous: ReadonlyMap<string, MasteryRecord>,
  nowWall: number,
): MasteryRecord[] {
  return masteryOutcomes(s).map((o) => {
    const prev = previous.get(`${o.entityId}|${o.skill}`);
    const before: Mastery | undefined = prev
      ? {
          mastery: prev.mastery,
          exposures: prev.exposures,
          lastSeenAt: Date.parse(prev.last_seen_at),
          dueAt: Date.parse(prev.due_at),
        }
      : undefined;
    const m = updateMastery(before, { itemScore: o.itemScore, correct: o.correct }, nowWall);
    return {
      entity_id: o.entityId,
      skill: o.skill,
      mastery: m.mastery,
      exposures: m.exposures,
      last_seen_at: iso(m.lastSeenAt),
      due_at: iso(m.dueAt),
    };
  });
}

export type PbOutcome = { key: string; isNew: boolean; previous: PbRecord | undefined };

/**
 * Writes the finished quiz locally in one transaction: the result, mastery, the Repeat Guard history for subsets, and
 * the personal best when it is better. Learn and practice runs have no PB. Returns what happened to the PB.
 */
export async function saveQuiz(
  db: MeridianDb,
  input: {
    result: GameResult;
    state: QuizState;
    mastery: readonly MasteryRecord[];
    history?: { pool_key: string; target_ids: string[] };
  },
): Promise<{ saved: boolean; pb: PbOutcome | null }> {
  const key = input.result.pb_key ?? null;
  const sum = summarize(input.state, 0);
  try {
    let pb: PbOutcome | null = null;
    await db.transaction("rw", ["results", "mastery", "history", "pbs"], async () => {
      await db.results.put({
        id: input.result.id,
        game_id: "quiz",
        ended_at: input.result.ended_at,
        ...(key ? { pb_key: key } : {}),
        data: input.result,
      });
      await db.mastery.bulkPut([...input.mastery]);
      if (input.history) await db.history.put({ game_id: "quiz", ...input.history });
      if (key) {
        const prev = await db.pbs.get(key);
        const next = {
          score: sum.points / Math.max(1, sum.total),
          activeMs: input.result.active_ms,
        };
        const better = isNewPb(
          prev ? { score: prev.score, activeMs: prev.active_ms } : undefined,
          next,
        );
        if (better)
          await db.pbs.put({
            pb_key: key,
            result_id: input.result.id,
            score: next.score,
            active_ms: next.activeMs,
          });
        pb = { key, isNew: better, previous: prev };
      }
    });
    return { saved: true, pb };
  } catch {
    return { saved: false, pb: null };
  }
}
