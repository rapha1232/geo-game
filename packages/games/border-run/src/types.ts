export type Mode = "unlimited" | "practice" | "daily";
export type RouteLength = "easy" | "normal" | "hard";
export type Classification = "on-route" | "near" | "off-route";
export type HintKind = "outline" | "initials" | "reveal";

/** Route length as the number of intermediate countries m (border-run §3). */
export const M_RANGE: Record<RouteLength, readonly [number, number]> = {
  easy: [2, 3],
  normal: [3, 5],
  hard: [5, 8],
};

export type BrConfig = {
  /** `world` or a continent code (AF, AS, EU, NA, OC, SA): both endpoints lie in it. */
  region: string;
  route: RouteLength;
  /** Allow the curated fixed links (tunnels, bridges, causeways). */
  crossings: boolean;
};

export const DEFAULT_CONFIG: BrConfig = { region: "world", route: "normal", crossings: false };

/** Guesses allowed beyond the minimum number of intermediates (border-run §2). */
export const EXTRA_GUESSES = 4;

export type GuessRow = {
  entityId: string;
  input: string;
  cls: Classification;
  /** True for the guess a "Reveal one" hint made. */
  viaHint?: boolean;
  note?: "spelling-corrected" | "former-name";
};

export type HintUse = { kind: HintKind; entityId?: string };

export type RoundStatus = "routing" | "won" | "lost";

/** Plain JSON: saved after every action and restored on reload. */
export type RoundState = {
  a: string;
  b: string;
  mode: Mode;
  config: BrConfig;
  /** Intermediate countries of a shortest route, m = L − 1. */
  m: number;
  status: RoundStatus;
  guesses: GuessRow[];
  hints: HintUse[];
  gaveUp: boolean;
};
