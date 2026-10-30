import { HOLD_MS, type MatchContext, type MatchResult } from "./types";
import type { NameIndex } from "./name-index";

/** Prefix-hold state for TYPE_ALL (quiz-library §5.2). `since` is a monotonic millisecond clock. */
export type Hold = { entityId: string; since: number } | null;

/**
 * A keystroke arrived. Returns what to show and the next hold state.
 * A hold continues only while the input stays on the same held entity; any other outcome cancels it.
 */
export function onInput(
  index: NameIndex,
  input: string,
  ctx: MatchContext,
  now: number,
  hold: Hold,
): { result: MatchResult; hold: Hold } {
  const result = index.match(input, ctx, { submitted: false });
  if (result.kind === "hold") {
    const since = hold && hold.entityId === result.entityId ? hold.since : now;
    return { result, hold: { entityId: result.entityId, since } };
  }
  return { result, hold: null };
}

/** The clock advanced with no keystroke. Returns the held item once 700 ms have passed. */
export function onTick(
  index: NameIndex,
  input: string,
  ctx: MatchContext,
  now: number,
  hold: Hold,
): MatchResult | null {
  if (!hold || now - hold.since < HOLD_MS) return null;
  const result = index.match(input, ctx, { submitted: true });
  return result.kind === "accept" && result.entityId === hold.entityId ? result : null;
}

/** Enter (or Space-then-Enter, or Tab): the held item is accepted immediately; fuzzy matching may also run. */
export function onSubmit(index: NameIndex, input: string, ctx: MatchContext): MatchResult {
  return index.match(input, ctx, { submitted: true });
}
