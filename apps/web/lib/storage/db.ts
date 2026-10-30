import Dexie, { type EntityTable } from "dexie";

/** Active session per game (DATA_MODEL §2.10). `state` and `eventLog` belong to the game engine. */
export type SessionRecord = {
  game_id: string;
  /** Monotonic per session; the higher of the IndexedDB and localStorage copies wins (ARCHITECTURE §9.1). */
  seq: number;
  /** Wall-clock ms, used only to expire stale sessions. Timers never use it. */
  updated_at: number;
  content_version: string;
  /** Shown on the resume prompt and the Home "Continue" card. */
  title: string;
  progress?: string;
  href: string;
  state: unknown;
  event_log?: unknown[];
};

export type PackRecord = { url: string; sha256: string; json: unknown };
export type SettingsRecord = { key: "settings"; value: Record<string, unknown> };
export type ResultRecord = {
  id: string;
  game_id: string;
  ended_at: string;
  pb_key?: string;
  daily_date?: string;
  data: unknown;
};
export type PbRecord = { pb_key: string; result_id: string; score: number; active_ms: number };
export type MasteryRecord = {
  entity_id: string;
  skill: string;
  mastery: number;
  exposures: number;
  last_seen_at: string;
  due_at: string;
};
export type HistoryRecord = { game_id: string; pool_key: string; target_ids: string[] };
export type SeenRecord = { kind: string; id: string };
export type FavoriteRecord = { item_key: string };

export class MeridianDb extends Dexie {
  sessions!: EntityTable<SessionRecord, "game_id">;
  results!: EntityTable<ResultRecord, "id">;
  pbs!: EntityTable<PbRecord, "pb_key">;
  mastery!: EntityTable<MasteryRecord>;
  history!: EntityTable<HistoryRecord>;
  seen!: EntityTable<SeenRecord>;
  favorites!: EntityTable<FavoriteRecord, "item_key">;
  settings!: EntityTable<SettingsRecord, "key">;
  packs!: EntityTable<PackRecord, "url">;

  constructor(name = "meridian") {
    super(name);
    // Version 1 mirrors DATA_MODEL §2.10 (achievements and syncQueue arrive with R2).
    // Later versions add `.version(n).upgrade()` steps, each tested against a fixture database.
    this.version(1).stores({
      sessions: "game_id, updated_at",
      results: "id, game_id, ended_at, pb_key, daily_date",
      pbs: "pb_key",
      mastery: "[entity_id+skill], due_at",
      history: "[game_id+pool_key]",
      seen: "[kind+id]",
      favorites: "item_key",
      settings: "key",
      packs: "url",
    });
  }
}
