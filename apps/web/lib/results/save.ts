import type { GameResult } from "@meridian/schemas";
import type { MeridianDb, MasteryRecord } from "../storage/db";

/**
 * Writes a finished round locally: the result, mastery updates and the Repeat Guard history, in one transaction.
 * Idempotent on the result id, so a retry after a reload never duplicates it. Returns false when storage is blocked,
 * and the game carries on in memory (AC-PL-011).
 */
export async function saveRound(
  db: MeridianDb,
  input: {
    result: GameResult;
    mastery: readonly MasteryRecord[];
    /** Absent for dailies: the schedule decides, not the Repeat Guard. */
    history?: { game_id: string; pool_key: string; target_ids: string[] };
  },
): Promise<boolean> {
  try {
    await db.transaction("rw", ["results", "mastery", "history"], async () => {
      await db.results.put({
        id: input.result.id,
        game_id: input.result.game_id,
        ended_at: input.result.ended_at,
        ...(input.result.pb_key ? { pb_key: input.result.pb_key } : {}),
        ...(input.result.daily_date ? { daily_date: input.result.daily_date } : {}),
        data: input.result,
      });
      await db.mastery.bulkPut([...input.mastery]);
      if (input.history) await db.history.put(input.history);
    });
    return true;
  } catch {
    return false;
  }
}

export async function loadMastery(
  db: MeridianDb,
  entityIds: readonly string[],
): Promise<Map<string, MasteryRecord>> {
  const out = new Map<string, MasteryRecord>();
  try {
    const rows = await db.mastery.toArray();
    const want = new Set(entityIds);
    for (const r of rows) if (want.has(r.entity_id)) out.set(`${r.entity_id}|${r.skill}`, r);
  } catch {
    /* unavailable storage: mastery starts fresh */
  }
  return out;
}

export async function loadHistory(
  db: MeridianDb,
  gameId: string,
  poolKey: string,
): Promise<string[]> {
  try {
    return (await db.history.get([gameId, poolKey]))?.target_ids ?? [];
  } catch {
    return [];
  }
}
