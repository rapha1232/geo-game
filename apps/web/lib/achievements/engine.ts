import { gameResult, type GameResult } from "@meridian/schemas";
import type { AchievementRecord, MeridianDb } from "../storage/db";
import { ACHIEVEMENTS, evaluate, type Achievement } from "./defs";

type Listener = (unlocked: Achievement[]) => void;
const listeners = new Set<Listener>();
/** Subscribes to new unlocks (the toaster). Returns the unsubscribe function. */
export function onUnlock(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let running: Promise<Achievement[]> | null = null;

/**
 * Evaluates every achievement against the stored results and writes the new unlocks. Safe to call any number of times:
 * an unlock is written once and a call that overlaps another waits for it.
 */
export function checkAchievements(db: MeridianDb, now = Date.now()): Promise<Achievement[]> {
  const run = async (): Promise<Achievement[]> => {
    try {
      const [rows, mastery, have] = await Promise.all([
        db.results.toArray(),
        db.mastery.toArray(),
        db.achievements.toArray(),
      ]);
      const results = rows.flatMap((r): GameResult[] => {
        const p = gameResult.safeParse(r.data);
        return p.success ? [p.data] : [];
      });
      const owned = new Set(have.map((h) => h.id));
      const fresh = evaluate(results, mastery).filter((e) => !owned.has(e.id));
      if (fresh.length === 0) return [];
      const records: AchievementRecord[] = fresh.map((e) => ({
        id: e.id,
        unlocked_at: new Date(now).toISOString(),
        result_id: e.resultId,
      }));
      await db.achievements.bulkPut(records);
      const unlocked = fresh.flatMap((e) => ACHIEVEMENTS.filter((a) => a.id === e.id));
      for (const l of listeners) l(unlocked);
      return unlocked;
    } catch {
      return [];
    }
  };
  running = (running ?? Promise.resolve([])).then(run, run);
  return running;
}

/** Runs the check after every stored result, once its transaction has committed. */
const watched = new WeakSet<MeridianDb>();
export function watchResults(db: MeridianDb): void {
  if (watched.has(db)) return;
  watched.add(db);
  db.results.hook("creating", (_key, _obj, trans) => {
    trans.on("complete", () => void checkAchievements(db));
  });
}
