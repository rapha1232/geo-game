import { selectNext, type Rng } from "@meridian/game-kit";
import { assignTiers } from "./rarity";
import {
  BREADTH_RANGE,
  REPEAT_WINDOW,
  RUN_LENGTH,
  TIER_POINTS,
  type Calibration,
  type Prompt,
  type RunMode,
  type Tier,
  type TimerSetting,
} from "./types";

/** One locked-in answer. The tier map is stored with the prompt at play time, so later recalibration cannot change it (AC-DC-012). */
export type PromptPlay = {
  promptId: string;
  /** Tier of every valid answer at the moment the prompt was shown. */
  tiers: Record<string, Tier>;
  /** Number of telemetry answers behind the tiers; 0 means the prior alone (provisional rarity). */
  calibrationN: number;
  selection: string | null;
  locked: boolean;
  /** The country locked in, or null for none at timeout. */
  answer: string | null;
  tier: Tier | null;
  points: number;
  timedOut: boolean;
};

export type RunState = {
  mode: RunMode;
  timer: TimerSetting;
  prompts: PromptPlay[];
  index: number;
  status: "playing" | "done";
};

export type PromptSource = {
  prompt(id: string): Prompt | undefined;
  calibration?(id: string): Calibration | undefined;
};

/**
 * Picks the prompts of a run: five from five different families, none from the last `REPEAT_WINDOW` played, aiming for a
 * mean breadth (answer count) between 8 and 20 (deep-cut §6.3, §11). `history` is prompt ids, oldest first.
 */
export function composeRun(
  prompts: readonly Prompt[],
  history: readonly string[],
  rng: Rng,
): { ids: string[]; history: string[] } {
  const byId = new Map(prompts.map((p) => [p.id, p]));
  const pool = prompts.map((p) => p.id).sort();
  const rules = {
    windowSize: Math.min(REPEAT_WINDOW, Math.floor(pool.length / 2)),
    relax: "halve-window" as const,
  };
  let best: string[] | null = null;
  let bestGap = Infinity;
  for (let attempt = 0; attempt < 60; attempt++) {
    const r = rng.fork(`attempt:${attempt}`);
    const ids: string[] = [];
    const families = new Set<string>();
    let h: readonly string[] = history;
    for (let i = 0; i < RUN_LENGTH; i++) {
      const open = pool.filter((id) => !families.has((byId.get(id) as Prompt).family));
      const pick = selectNext(open, h, r.fork(`p${i}`), rules);
      ids.push(pick.id);
      families.add((byId.get(pick.id) as Prompt).family);
      h = pick.history;
    }
    const mean = ids.reduce((s, id) => s + (byId.get(id) as Prompt).answers.length, 0) / RUN_LENGTH;
    const gap =
      mean < BREADTH_RANGE[0]
        ? BREADTH_RANGE[0] - mean
        : mean > BREADTH_RANGE[1]
          ? mean - BREADTH_RANGE[1]
          : 0;
    if (gap < bestGap) {
      best = ids;
      bestGap = gap;
    }
    if (gap === 0) break;
  }
  const ids = best as string[];
  return { ids, history: [...history, ...ids].slice(-500) };
}

export function startRun(
  source: PromptSource,
  ids: readonly string[],
  mode: RunMode,
  timer: TimerSetting,
): RunState {
  return {
    mode,
    timer: mode === "practice" ? 0 : timer,
    index: 0,
    status: "playing",
    prompts: ids.map((id) => {
      const prompt = source.prompt(id) as Prompt;
      const cal = source.calibration?.(id);
      return {
        promptId: id,
        tiers: Object.fromEntries(assignTiers(prompt, cal)),
        calibrationN: cal?.n ?? 0,
        selection: null,
        locked: false,
        answer: null,
        tier: null,
        points: 0,
        timedOut: false,
      };
    }),
  };
}

const current = (s: RunState): PromptPlay => s.prompts[s.index] as PromptPlay;
const patch = (s: RunState, p: Partial<PromptPlay>): RunState => ({
  ...s,
  prompts: s.prompts.map((x, i) => (i === s.index ? { ...x, ...p } : x)),
});

/** Chooses (or changes) the country; nothing counts until it is locked in. */
export function select(s: RunState, entityId: string | null): RunState {
  return s.status !== "playing" || current(s).locked ? s : patch(s, { selection: entityId });
}

export type LockResult = {
  state: RunState;
  valid: boolean;
  tier: Tier | null;
  points: number;
  message: string | null;
};

/**
 * Locks the selection (Lock in, Enter, or the timer reaching zero). A valid answer scores its tier, an invalid one
 * scores 0 and says why (AC-DC-003, 004, 005, 006).
 */
export function lock(
  s: RunState,
  source: PromptSource,
  nameOf: (id: string) => string,
  opts: { timedOut?: boolean } = {},
): LockResult {
  const play = current(s);
  if (s.status !== "playing" || play.locked)
    return { state: s, valid: false, tier: null, points: 0, message: null };
  const prompt = source.prompt(play.promptId) as Prompt;
  const pick = play.selection;
  const tier = pick ? (play.tiers[pick] ?? null) : null;
  const points = tier ? TIER_POINTS[tier] : 0;
  const message = pick && !tier ? prompt.invalid.replace("{name}", nameOf(pick)) : null;
  return {
    state: patch(s, {
      locked: true,
      answer: pick,
      tier,
      points: s.mode === "practice" ? 0 : points,
      timedOut: opts.timedOut === true,
    }),
    valid: tier !== null,
    tier,
    points,
    message,
  };
}

/** After the reveal: the next prompt, or the end of the run. */
export function advance(s: RunState): RunState {
  if (s.status !== "playing" || !current(s).locked) return s;
  return s.index + 1 >= s.prompts.length ? { ...s, status: "done" } : { ...s, index: s.index + 1 };
}

export const total = (s: RunState): number => s.prompts.reduce((sum, p) => sum + p.points, 0);
/** The most a run can score: five Deep Cut answers (5,000). */
export const MAX_RUN_POINTS = RUN_LENGTH * TIER_POINTS["deep-cut"];
/** True when any prompt used the prior alone, so the result says "provisional rarity" (AC-DC-013). */
export const provisional = (s: RunState): boolean => s.prompts.some((p) => p.calibrationN === 0);

/** Practice only (deep-cut §7): how many valid answers there are, and one Solid answer. */
export const answerCount = (source: PromptSource, id: string): number =>
  (source.prompt(id) as Prompt).answers.length;
export function oneSolid(s: RunState): string | null {
  return (
    Object.entries(current(s).tiers)
      .sort(([a], [b]) => a.localeCompare(b))
      .find(([, t]) => t === "solid")?.[0] ?? null
  );
}
