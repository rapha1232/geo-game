/** Rarity tiers, rarest first (deep-cut §6.1). */
export const TIERS = ["deep-cut", "deep", "sharp", "solid", "obvious"] as const;
export type Tier = (typeof TIERS)[number];

export const TIER_POINTS: Record<Tier, number> = {
  obvious: 100,
  solid: 250,
  sharp: 450,
  deep: 700,
  "deep-cut": 1000,
};
export const TIER_GLYPH: Record<Tier, string> = {
  obvious: "◔",
  solid: "◑",
  sharp: "◕",
  deep: "●",
  "deep-cut": "◆",
};
export const TIER_NAME: Record<Tier, string> = {
  obvious: "Obvious",
  solid: "Solid",
  sharp: "Sharp",
  deep: "Deep",
  "deep-cut": "Deep Cut",
};

export type Prompt = {
  id: string;
  family: string;
  text: string;
  answers: readonly string[];
  explanation: string;
  /** Explains a wrong answer; `{name}` stands for the country picked. */
  invalid: string;
  /** Prior obviousness `o` per answer, 0 to 1. */
  rarity_prior: Readonly<Record<string, number>>;
};

/** How often each answer was chosen across valid answers to a prompt, from anonymous telemetry (deep-cut §6.2). */
export type Calibration = { n: number; picks: Readonly<Record<string, number>> };

export type RunMode = "run" | "practice";
export type TimerSetting = 60 | 30 | 0;

export const RUN_LENGTH = 5;
export const BREADTH_RANGE = [8, 20] as const;
export const REPEAT_WINDOW = 300;
