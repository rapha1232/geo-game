import { z } from "zod";
import { contentVersion, entityId, isoDate, isoDateTime, seed, ulid } from "./ids";

export const GAME_IDS = [
  "quiz",
  "silhouette",
  "fact-pin",
  "deep-cut",
  "border-run",
  "rank-it",
  "chronology",
  "lost-borders",
  "knowledge-run",
] as const;
export const gameId = z.enum(GAME_IDS);
export type GameId = z.infer<typeof gameId>;

export const MODES = [
  "timed",
  "untimed",
  "learn",
  "practice",
  "practice-misses",
  "unlimited",
  "daily",
  "seeded",
  "run",
  "endless",
] as const;
export const OUTCOMES = [
  "completed",
  "solved",
  "failed",
  "gave_up",
  "timeout",
  "lives_out",
] as const;

export const resultItem = z.object({
  item_id: z.string().min(1),
  entity_id: z.string().min(1).optional(),
  input: z.string().max(200).optional(),
  status: z.string().min(1),
  attempts: z.number().int().nonnegative().optional(),
  hints: z.number().int().nonnegative().optional(),
  points: z.number().optional(),
  ms: z.number().int().nonnegative().optional(),
});

export const resultFlags = z.object({
  resumed: z.boolean(),
  pauseCount: z.number().int().nonnegative(),
  assisted: z.boolean(),
  guardRelaxed: z.boolean(),
  attempt: z.number().int().min(1),
});

/** Game result, client and server (DATA_MODEL §2.9). Field names are snake_case on the wire. */
export const gameResult = z
  .object({
    id: ulid,
    game_id: gameId,
    mode: z.enum(MODES),
    config: z.record(z.string(), z.unknown()),
    config_hash: z.string().min(1),
    pb_key: z.string().min(1).optional(),
    seed,
    daily_date: isoDate.optional(),
    challenge_code: z.string().min(1).optional(),
    content_version: contentVersion,
    score: z.number().nonnegative(),
    max_score: z.number().nonnegative(),
    outcome: z.enum(OUTCOMES),
    items: z.array(resultItem).max(500),
    meta: z.record(z.string(), z.unknown()).optional(),
    flags: resultFlags,
    started_at: isoDateTime,
    ended_at: isoDateTime,
    active_ms: z.number().int().nonnegative(),
    event_log: z.array(z.unknown()).optional(),
  })
  .superRefine((r, ctx) => {
    if (r.score > r.max_score)
      ctx.addIssue({ code: "custom", path: ["score"], message: "score exceeds max_score" });
    const start = Date.parse(r.started_at);
    const end = Date.parse(r.ended_at);
    if (end < start)
      ctx.addIssue({
        code: "custom",
        path: ["ended_at"],
        message: "ended_at is before started_at",
      });
    if (r.active_ms > end - start + 60_000)
      ctx.addIssue({
        code: "custom",
        path: ["active_ms"],
        message: "active_ms exceeds the elapsed time plus 60 s",
      });
    if (r.mode === "daily" && !r.daily_date)
      ctx.addIssue({
        code: "custom",
        path: ["daily_date"],
        message: "daily results need daily_date",
      });
  });
export type GameResult = z.infer<typeof gameResult>;

export { entityId };
