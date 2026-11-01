import { Rng } from "@meridian/game-kit";
import { NameIndex, type MatchEntity } from "@meridian/name-matcher";

/** Subdivision quizzes (quiz-library §4.2, R2): name them all, or find each on the map. */
export type SubItem = MatchEntity;

export type SubStatus = "playing" | "done" | "gave_up";

export type NameAllRound = {
  kind: "sub-name";
  country: string;
  ids: string[];
  found: string[];
  status: SubStatus;
};
export type FindRound = {
  kind: "sub-find";
  country: string;
  /** The order the prompts come in. */
  order: string[];
  /** Index of the prompt being asked. */
  index: number;
  /** Wrong clicks on the current prompt. */
  attempts: number;
  /** Points per finished prompt: 1, 0.5, 0.25, or 0 when missed. */
  scores: Record<string, number>;
  status: SubStatus;
};
export type SubRound = NameAllRound | FindRound;

export const FIND_SCORES = [1, 0.5, 0.25] as const;
export const FIND_ATTEMPTS = 3;

export const newNameAll = (country: string, items: readonly SubItem[]): NameAllRound => ({
  kind: "sub-name",
  country,
  ids: items.map((i) => i.id).sort(),
  found: [],
  status: "playing",
});

/** Prompts in a seeded random order. */
export function newFind(country: string, items: readonly SubItem[], seed: string): FindRound {
  return {
    kind: "sub-find",
    country,
    order: new Rng(`${seed}|sub-find|${country}`).shuffle(items.map((i) => i.id).sort()),
    index: 0,
    attempts: 0,
    scores: {},
    status: "playing",
  };
}

export const subIndex = (items: readonly SubItem[]): NameIndex => new NameIndex(items);

export type NameEvent =
  | { kind: "accepted"; id: string }
  | { kind: "already"; id: string }
  | { kind: "ambiguous"; message: string }
  | { kind: "hold" }
  | { kind: "not-recognized" }
  | { kind: "ignored" };

/**
 * Typed text against the subdivisions still to name. Exact names count as you type; Enter (`submitted`) also allows a
 * near miss, as in the main quizzes (quiz-library §5.1).
 */
export function submitName(
  round: NameAllRound,
  index: NameIndex,
  text: string,
  submitted: boolean,
): { round: NameAllRound; event: NameEvent } {
  if (round.status !== "playing") return { round, event: { kind: "ignored" } };
  const remaining = new Set(round.ids.filter((id) => !round.found.includes(id)));
  const ctx = {
    mode: "type_all" as const,
    remaining,
    named: new Set(round.found),
    inQuiz: new Set(round.ids),
  };
  let r = index.match(text, { ...ctx, strictness: "standard" }, { submitted });
  // Postal abbreviations (CA, NY) are how people write these places; the matcher only reads codes on Lenient, so a
  // short unrecognised entry gets a second look that way.
  // Only on Enter: as you type, "ne" would otherwise settle on Nebraska before you reach "New York".
  if (submitted && r.kind === "not-recognized" && /^[A-Za-z]{2,3}$/.test(text.trim()))
    r = index.match(text, { ...ctx, strictness: "lenient", enableCodes: true }, { submitted });
  switch (r.kind) {
    case "accept": {
      const found = [...round.found, r.entityId];
      return {
        round: { ...round, found, status: found.length === round.ids.length ? "done" : "playing" },
        event: { kind: "accepted", id: r.entityId },
      };
    }
    case "already-named":
      return { round, event: { kind: "already", id: r.entityId } };
    case "ambiguous":
      return { round, event: { kind: "ambiguous", message: r.message } };
    case "hold":
      return { round, event: { kind: "hold" } };
    case "ignore":
      return { round, event: { kind: "ignored" } };
    default:
      return { round, event: { kind: "not-recognized" } };
  }
}

export type SubClickEvent =
  | { kind: "correct"; score: number }
  | { kind: "wrong"; clickedId: string; triesLeft: number }
  | { kind: "missed"; answer: string }
  | { kind: "ignored" };

/** Find it: three tries per place, scoring 1, 0.5 and 0.25; the third miss reveals it and moves on. */
export function clickSub(round: FindRound, id: string): { round: FindRound; event: SubClickEvent } {
  const target = round.order[round.index];
  if (round.status !== "playing" || target === undefined || !round.order.includes(id))
    return { round, event: { kind: "ignored" } };
  const advance = (score: number): FindRound => {
    const index = round.index + 1;
    return {
      ...round,
      scores: { ...round.scores, [target]: score },
      index,
      attempts: 0,
      status: index >= round.order.length ? "done" : "playing",
    };
  };
  if (id === target) {
    const score = FIND_SCORES[Math.min(round.attempts, FIND_ATTEMPTS - 1)] as number;
    return { round: advance(score), event: { kind: "correct", score } };
  }
  const attempts = round.attempts + 1;
  if (attempts >= FIND_ATTEMPTS)
    return { round: advance(0), event: { kind: "missed", answer: target } };
  return {
    round: { ...round, attempts },
    event: { kind: "wrong", clickedId: id, triesLeft: FIND_ATTEMPTS - attempts },
  };
}

export const giveUpSub = <R extends SubRound>(round: R): R =>
  round.status === "playing" ? { ...round, status: "gave_up" } : round;

/** Whole percent: places named, or prompt points earned out of the places asked. */
export function subScore(round: SubRound): number {
  if (round.kind === "sub-name") return Math.round((100 * round.found.length) / round.ids.length);
  const points = Object.values(round.scores).reduce((a, b) => a + b, 0);
  return Math.round((100 * points) / round.order.length);
}

/** The place being asked in Find it, or null when finished. */
export const currentPrompt = (r: FindRound): string | null =>
  r.status === "playing" ? (r.order[r.index] ?? null) : null;
