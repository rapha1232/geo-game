import { z } from "zod";
import { gameResult } from "@meridian/schemas";
import type { MeridianDb } from "../storage/db";

/** The "Export my data" file (UX_AND_DESIGN §11, DATA_MODEL §2.10). Everything the guest profile holds, as plain JSON. */
export const EXPORT_FORMAT = 1;
export const MAX_IMPORT_BYTES = 25 * 1024 * 1024;

const exportFile = z.object({
  app: z.literal("meridian"),
  format: z.literal(EXPORT_FORMAT),
  exported_at: z.string(),
  settings: z.record(z.string(), z.unknown()).default({}),
  results: z.array(z.object({ id: z.string(), data: z.unknown() })),
  pbs: z.array(
    z.object({
      pb_key: z.string(),
      result_id: z.string(),
      score: z.number(),
      active_ms: z.number(),
    }),
  ),
  mastery: z.array(
    z.object({
      entity_id: z.string(),
      skill: z.string(),
      mastery: z.number(),
      exposures: z.number(),
      last_seen_at: z.string(),
      due_at: z.string(),
    }),
  ),
  history: z.array(
    z.object({ game_id: z.string(), pool_key: z.string(), target_ids: z.array(z.string()) }),
  ),
  seen: z.array(z.object({ kind: z.string(), id: z.string() })),
  favorites: z.array(z.object({ item_key: z.string() })),
});
export type ExportFile = z.infer<typeof exportFile>;

export async function exportData(db: MeridianDb, now: number): Promise<ExportFile> {
  const [results, pbs, mastery, history, seen, favorites, settings] = await Promise.all([
    db.results.toArray(),
    db.pbs.toArray(),
    db.mastery.toArray(),
    db.history.toArray(),
    db.seen.toArray(),
    db.favorites.toArray(),
    db.settings.get("settings"),
  ]);
  return {
    app: "meridian",
    format: EXPORT_FORMAT,
    exported_at: new Date(now).toISOString(),
    settings: settings?.value ?? {},
    results: results.map((r) => ({ id: r.id, data: r.data })),
    pbs,
    mastery,
    history,
    seen,
    favorites,
  };
}

export type ImportSummary = {
  results: number;
  skipped: number;
  mastery: number;
  favorites: number;
};
export class ImportError extends Error {}

/** Reads and checks a file's text. Throws `ImportError` with a short reason the page can show. */
export function parseExport(text: string): ExportFile {
  if (text.length > MAX_IMPORT_BYTES) throw new ImportError("too-large");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ImportError("not-json");
  }
  const parsed = exportFile.safeParse(json);
  if (!parsed.success) {
    const head = (json as { app?: unknown } | null)?.app;
    throw new ImportError(head === "meridian" ? "damaged" : "not-meridian");
  }
  return parsed.data;
}

const MAX_SEEN = 2000;

/**
 * Merges a file into the profile (UX_AND_DESIGN §11): results union by id (each checked against the result schema),
 * personal bests keep the better one, mastery keeps the most recent exposure, favorites and seen sets union, history
 * lists join with the local order first, and settings keep what is already set here.
 */
export async function importData(db: MeridianDb, file: ExportFile): Promise<ImportSummary> {
  const valid = file.results.flatMap((r) => {
    const p = gameResult.safeParse(r.data);
    return p.success && p.data.id === r.id ? [{ row: r, result: p.data }] : [];
  });
  const validIds = new Set(valid.map((v) => v.result.id));
  let masteryCount = 0;
  await db.transaction(
    "rw",
    ["results", "pbs", "mastery", "history", "seen", "favorites", "settings"],
    async () => {
      await db.results.bulkPut(
        valid.map(({ result }) => ({
          id: result.id,
          game_id: result.game_id,
          ended_at: result.ended_at,
          ...(result.pb_key ? { pb_key: result.pb_key } : {}),
          ...(result.daily_date ? { daily_date: result.daily_date } : {}),
          data: result,
        })),
      );
      for (const pb of file.pbs) {
        if (!validIds.has(pb.result_id) && !(await db.results.get(pb.result_id))) continue;
        const prev = await db.pbs.get(pb.pb_key);
        if (
          !prev ||
          pb.score > prev.score ||
          (pb.score === prev.score && pb.active_ms < prev.active_ms)
        )
          await db.pbs.put(pb);
      }
      for (const m of file.mastery) {
        const prev = await db.mastery.get([m.entity_id, m.skill]);
        if (!prev || Date.parse(m.last_seen_at) > Date.parse(prev.last_seen_at)) {
          await db.mastery.put(m);
          masteryCount++;
        }
      }
      for (const h of file.history) {
        const prev = await db.history.get([h.game_id, h.pool_key]);
        const merged = [...(prev?.target_ids ?? [])];
        for (const id of h.target_ids) if (!merged.includes(id)) merged.push(id);
        await db.history.put({ ...h, target_ids: merged.slice(-MAX_SEEN) });
      }
      await db.seen.bulkPut(file.seen);
      await db.favorites.bulkPut(file.favorites);
      const cur = (await db.settings.get("settings"))?.value ?? {};
      await db.settings.put({ key: "settings", value: { ...file.settings, ...cur } });
    },
  );
  return {
    results: valid.length,
    skipped: file.results.length - valid.length,
    mastery: masteryCount,
    favorites: file.favorites.length,
  };
}

/** Deletes everything stored on this device: results, bests, mastery, history, favorites, settings and saved sessions. */
export async function deleteAll(db: MeridianDb): Promise<void> {
  await db.transaction(
    "rw",
    ["results", "pbs", "mastery", "history", "seen", "favorites", "settings", "sessions"],
    async () => {
      await Promise.all([
        db.results.clear(),
        db.pbs.clear(),
        db.mastery.clear(),
        db.history.clear(),
        db.seen.clear(),
        db.favorites.clear(),
        db.settings.clear(),
        db.sessions.clear(),
      ]);
    },
  );
}
