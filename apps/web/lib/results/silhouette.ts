import { configHash, elapsedMs } from "@meridian/game-kit";
import { gameResult, type GameResult } from "@meridian/schemas";
import { freeHints, roundPoints } from "@meridian/silhouette";
import { answerFollowUp } from "@meridian/silhouette";
import { followUpsCorrect, type Session } from "../silhouette/controller";
import type { MasteryRecord } from "../storage/db";
import { updateMastery, type Mastery } from "@meridian/game-kit";

/** Points available in a round: 6 for the main round plus 1 per follow-up (DATA_MODEL §2.9). */
export const maxScore = (s: Session): number => 6 + s.followUps.length;

/**
 * The GameResult of a finished Silhouette round. Practice rounds are recorded with mode `practice` and stay out of
 * the statistics.
 */
export function silhouetteResult(
  s: Session,
  ctx: { id: string; contentVersion: string; endedAt: number; tzUnused?: never },
): GameResult {
  const target = s.round.targetId;
  const paid = s.round.hints.filter((h) => !freeHints(s.round.difficulty).includes(h)).length;
  const row = s.round.guesses;
  const activeMs = Math.round(elapsedMs(s.timer, ctx.endedAt));
  const startedAt = Math.min(s.startedAt, ctx.endedAt);
  const result = {
    id: ctx.id,
    game_id: "silhouette" as const,
    mode: s.config.mode,
    config: {
      pool: s.config.pool.kind,
      difficulty: s.config.difficulty,
      followUps: s.config.followUps,
    },
    config_hash: configHash({
      pool: s.config.pool,
      difficulty: s.config.difficulty,
      followUps: s.config.followUps,
    }),
    seed: s.seed,
    ...(s.config.mode === "daily" && s.config.date ? { daily_date: s.config.date } : {}),
    ...(s.challenge ? { challenge_code: s.challenge.code } : {}),
    content_version: ctx.contentVersion,
    score: roundPoints(s.round, followUpsCorrect(s)),
    max_score: maxScore(s),
    outcome: s.round.gaveUp
      ? ("gave_up" as const)
      : s.round.status === "solved"
        ? ("solved" as const)
        : ("failed" as const),
    items: [
      {
        item_id: "target",
        entity_id: target,
        status: s.round.status === "solved" ? "correct" : "wrong",
        attempts: row.length,
        hints: paid,
        points: roundPoints(s.round),
        ms: activeMs,
      },
      ...s.followUps.map((f) => ({
        item_id: `followup:${f.prompt.kind}`,
        status:
          f.choice === null ? "skipped" : answerFollowUp(f.prompt, f.choice) ? "correct" : "wrong",
        points: f.choice !== null && answerFollowUp(f.prompt, f.choice) ? 1 : 0,
      })),
    ],
    meta: {
      guesses: row.map((g) => ({
        entity_id: g.entityId,
        km: g.distanceKm,
        ...(g.sector ? { sector: g.sector } : {}),
        proximity: g.proximity,
        ...(g.sharesBorder ? { border: true } : {}),
      })),
    },
    flags: {
      resumed: s.resumed,
      pauseCount: 0,
      assisted: false,
      guardRelaxed: s.guardRelaxed,
      attempt: 1,
    },
    started_at: new Date(startedAt).toISOString(),
    ended_at: new Date(ctx.endedAt).toISOString(),
    active_ms: Math.min(activeMs, Math.max(0, ctx.endedAt - startedAt) + 60_000),
  };
  return gameResult.parse(result);
}

const iso = (ms: number): string => new Date(ms).toISOString();

export type MasteryUpdate = MasteryRecord;

/** Per-skill mastery updates from one round: `shape` for the target, `capital` and `flag` for answered follow-ups. */
export function masteryUpdates(
  s: Session,
  previous: ReadonlyMap<string, MasteryRecord>,
  now: number,
): MasteryUpdate[] {
  if (s.config.mode === "practice") return [];
  const target = s.round.targetId;
  const solved = s.round.status === "solved";
  const hintsPaid = s.round.hints.length;
  const itemScore = solved
    ? Math.max(0, 1 - (s.round.guesses.length - 1) * 0.15 - hintsPaid * 0.1)
    : 0;
  const items: { entity: string; skill: string; score: number; correct: boolean }[] = [
    { entity: target, skill: "shape", score: itemScore, correct: solved },
    ...s.followUps.flatMap((f) =>
      f.choice === null
        ? []
        : [
            {
              entity: target,
              skill: f.prompt.kind,
              score: answerFollowUp(f.prompt, f.choice) ? 1 : 0,
              correct: answerFollowUp(f.prompt, f.choice),
            },
          ],
    ),
  ];
  return items.map((it) => {
    const prev = previous.get(`${it.entity}|${it.skill}`);
    const before: Mastery | undefined = prev
      ? {
          mastery: prev.mastery,
          exposures: prev.exposures,
          lastSeenAt: Date.parse(prev.last_seen_at),
          dueAt: Date.parse(prev.due_at),
        }
      : undefined;
    const m = updateMastery(before, { itemScore: it.score, correct: it.correct }, now);
    return {
      entity_id: it.entity,
      skill: it.skill,
      mastery: m.mastery,
      exposures: m.exposures,
      last_seen_at: iso(m.lastSeenAt),
      due_at: iso(m.dueAt),
    };
  });
}
