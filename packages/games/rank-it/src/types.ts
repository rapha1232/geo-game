export type Format = "order" | "higher-lower" | "top-picks";
export type Difficulty = "easy" | "normal" | "hard";
export type Mode = "unlimited" | "daily" | "seeded";

export type StatDef = {
  id: string;
  label: string;
  unit: string;
  sort: "desc";
  separation: { relative: number } | { absolute: number };
  decimals: number;
  source_id: string;
  source_note: string;
};

export type RankEntity = {
  id: string;
  name: string;
  /** Continent code: AF, AS, EU, NA, OC, SA. */
  continent: string;
  /** 0 (obscure) to 1 (familiar), from `difficulty.fam`. */
  familiarity: number;
};

/** `[value, year | null]` per entity and statistic; entities without a value are absent. */
export type StatValues = Record<string, Record<string, readonly [number, number | null]>>;

export type RankWorld = {
  entities: readonly RankEntity[];
  byId: ReadonlyMap<string, RankEntity>;
  stats: readonly StatDef[];
  statById: ReadonlyMap<string, StatDef>;
  values: StatValues;
};

export type RankConfig = {
  format: Format;
  /** A statistic id, or `random`. */
  stat: string;
  /** `world` or a continent code. */
  scope: string;
  difficulty: Difficulty;
};

export const DEFAULT_CONFIG: RankConfig = {
  format: "order",
  stat: "random",
  scope: "world",
  difficulty: "normal",
};

export const ORDER_SIZE = 5;
export const GRID_SIZE = 16;
export const TOP_PICKS = 5;
