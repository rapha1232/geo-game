import type { MeridianDb } from "../storage/db";
import { LIBRARY, defaultConfig } from "../quiz/library";
import type { GameResult } from "@meridian/schemas";

/** Favorites live in IndexedDB (R1, local only). Failures read as "none" and writes report false. */
export async function readFavorites(db: MeridianDb): Promise<Set<string>> {
  try {
    return new Set((await db.favorites.toArray()).map((f) => f.item_key));
  } catch {
    return new Set();
  }
}

export async function setFavorite(db: MeridianDb, key: string, on: boolean): Promise<boolean> {
  try {
    if (on) await db.favorites.put({ item_key: key });
    else await db.favorites.delete(key);
    return true;
  } catch {
    return false;
  }
}

/** The catalog key a result belongs to: a Silhouette round, or the named quiz with the same template, scope and format. */
export function catalogKeyOf(r: GameResult): string | null {
  if (r.game_id === "silhouette") return "game:silhouette";
  if (r.game_id !== "quiz") return null;
  const c = r.config as {
    template?: string;
    scope?: { kind: string; id?: string };
    format?: string;
  };
  const hit = LIBRARY.find((q) => {
    const d = defaultConfig(q);
    return (
      d.template === c.template &&
      d.format === c.format &&
      d.scope.kind === c.scope?.kind &&
      ("id" in d.scope ? d.scope.id : undefined) === c.scope?.id
    );
  });
  return hit ? `quiz:${hit.slug}` : null;
}

/** Last played time per catalog key, from the local results. */
export function playedFrom(results: readonly GameResult[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of results) {
    const key = catalogKeyOf(r);
    if (!key) continue;
    out.set(key, Math.max(out.get(key) ?? 0, Date.parse(r.ended_at)));
  }
  return out;
}
