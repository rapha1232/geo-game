import { DEFAULT_CONFIG } from "@meridian/fact-pin";
import type { MeridianDb } from "../storage/db";
import { poolKey } from "../fact-pin/session";

const MAX_SEEN = 2000;

/**
 * Facts read in the Atlas count as seen by Fact Pin's Repeat Guard, so browsing does not spoil upcoming rounds
 * (atlas-explorer §7). They join every Fact Pin pool this player has, or the default pool when there is none yet.
 */
export async function markFactsSeen(db: MeridianDb, factIds: readonly string[]): Promise<void> {
  try {
    // The history table is keyed by [game_id+pool_key], so the game is filtered after reading.
    const rows = (await db.history.toArray()).filter((r) => r.game_id === "fact-pin");
    const targets =
      rows.length > 0
        ? rows
        : [{ game_id: "fact-pin", pool_key: poolKey(DEFAULT_CONFIG), target_ids: [] as string[] }];
    await db.transaction("rw", ["history"], async () => {
      for (const row of targets) {
        const merged = [...row.target_ids];
        for (const id of factIds) if (!merged.includes(id)) merged.push(id);
        await db.history.put({ ...row, target_ids: merged.slice(-MAX_SEEN) });
      }
    });
  } catch {
    /* storage unavailable: browsing still works */
  }
}
