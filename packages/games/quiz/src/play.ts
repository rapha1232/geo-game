import {
  Rng,
  elapsedMs,
  newTimer,
  pauseTimer,
  remainingMs,
  startTimer,
  type Timer,
} from "@meridian/game-kit";
import { norm, type MatchContext, type MatchResult } from "@meridian/name-matcher";
import {
  MAP_CLICK_SCORES,
  MAX_ATTEMPTS,
  MAX_TYPE_ALL_HINTS,
  type ItemNote,
  type ItemState,
  type Quiz,
  type QuizState,
} from "./types";
import { scopeLabel, type QuizWorld } from "./world";

const fresh = (): ItemState => ({ status: "pending", score: 0, attempts: 0, hints: 0 });

/** A new quiz in the `ready` state: the clock starts at the first input (quiz-library §8.5). */
export function newQuizState(quiz: Quiz): QuizState {
  return {
    quiz,
    phase: "ready",
    timer: newTimer(),
    items: quiz.items.map(fresh),
    queue: quiz.items.map((_, i) => i),
    hintsUsed: 0,
    fiftyUsed: 0,
  };
}

const isOpen = (s: QuizState): boolean => s.phase === "ready" || s.phase === "playing";
const learn = (s: QuizState): boolean => s.quiz.config.learn === true;

/** Starts or resumes the clock. The first input does this by itself. */
export function begin(s: QuizState, now: number): QuizState {
  if (s.phase === "review" || s.phase === "playing") return s;
  return { ...s, phase: "playing", timer: startTimer(s.timer, now) };
}

export function pause(s: QuizState, now: number): QuizState {
  return s.phase === "playing" ? { ...s, phase: "paused", timer: pauseTimer(s.timer, now) } : s;
}

/** Resume after a pause or reload. */
export function resume(s: QuizState, now: number): QuizState {
  return s.phase === "paused" ? { ...s, phase: "playing", timer: startTimer(s.timer, now) } : s;
}

/** The state restored from storage is paused with the active time kept (ARCHITECTURE §9). */
export function restoreQuiz(s: QuizState): QuizState {
  return s.phase === "playing" || s.phase === "paused"
    ? { ...s, phase: "paused", timer: { elapsedMs: s.timer.elapsedMs, runningSince: null } }
    : s;
}

export const timeLeftMs = (s: QuizState, now: number): number | null =>
  s.quiz.limitMs === null ? null : Math.max(0, remainingMs(s.timer, now, s.quiz.limitMs));

function end(s: QuizState, reason: NonNullable<QuizState["endReason"]>, now: number): QuizState {
  return { ...s, phase: "review", timer: pauseTimer(s.timer, now), endReason: reason };
}

/** Ends the quiz when the time is up. Call from the UI's tick. */
export function tick(s: QuizState, now: number): QuizState {
  if (s.phase !== "playing" || s.quiz.limitMs === null) return s;
  return elapsedMs(s.timer, now) >= s.quiz.limitMs ? end(s, "timeout", now) : s;
}

export const giveUp = (s: QuizState, now: number): QuizState =>
  s.phase === "review" ? s : end(markMissed(s), "give_up", now);

/** Whatever is still pending when the quiz ends counts as missed. */
function markMissed(s: QuizState): QuizState {
  return {
    ...s,
    items: s.items.map((it) => (it.status === "pending" ? { ...it, status: "missed" } : it)),
    queue: [],
  };
}

function finishIfDone(s: QuizState, now: number): QuizState {
  return s.items.every((it) => it.status !== "pending") ? end(s, "complete", now) : s;
}

const setItem = (s: QuizState, i: number, patch: Partial<ItemState>): QuizState => ({
  ...s,
  items: s.items.map((it, k) => (k === i ? { ...it, ...patch } : it)),
});

/** Index of the item being asked, for the prompted formats. */
export const currentIndex = (s: QuizState): number | null => s.queue[0] ?? null;

// ---------------------------------------------------------------------------------------------------------------------
// Typing

export type TypeEvent =
  | { kind: "ignored" }
  | { kind: "try-english" }
  | { kind: "not-recognized" }
  | { kind: "hold"; entityId: string; holdMs: number }
  | { kind: "ambiguous"; message: string }
  | { kind: "already-named"; itemId: string; name: string }
  | { kind: "not-in-quiz"; message: string }
  | { kind: "wrong"; entityId: string; learn: boolean }
  | { kind: "accepted"; itemId: string; note?: ItemNote; via: "exact" | "fuzzy"; text: string }
  | { kind: "over" };

/** The matcher context for the current moment (TYPE_ALL or TYPE_PROMPTED). */
export function matchContext(s: QuizState): MatchContext {
  const { quiz } = s;
  const remaining = new Set<string>();
  const named = new Set<string>();
  quiz.items.forEach((it, i) => {
    const target = s.items[i]?.status === "pending" ? remaining : named;
    for (const a of it.answerIds) target.add(a);
  });
  const all = new Set(quiz.items.flatMap((it) => it.answerIds));
  const base = {
    remaining,
    named,
    strictness: quiz.config.strictness,
    enableCodes: quiz.config.strictness === "lenient",
    learn: learn(s),
  };
  if (quiz.config.format === "TYPE_ALL") return { ...base, mode: "type_all" };
  const cur = currentIndex(s);
  return {
    ...base,
    mode: "type_prompted",
    promptAnswers: new Set(cur === null ? [] : (quiz.items[cur]?.answerIds ?? [])),
    inQuiz: all,
  };
}

/** What the matcher says about the input, without changing anything. The UI uses it for keystrokes and prefix-hold. */
export function matchInput(
  world: QuizWorld,
  s: QuizState,
  input: string,
  submitted: boolean,
): MatchResult {
  return world.indexes[s.quiz.universe].match(input, matchContext(s), { submitted });
}

const outReason = (
  world: QuizWorld,
  s: QuizState,
  entityId: string,
  reason: string | undefined,
): string => {
  const name = world.byId.get(entityId)?.name ?? world.groupById.get(entityId)?.name ?? entityId;
  return `Not in this quiz: ${reason ?? `${name} is not part of ${scopeLabel(world, s.quiz.config.scope)}.`}`;
};

/** Applies a matcher result to the quiz. Pure; `submitted` is true for Enter, false for a keystroke. */
export function applyMatch(
  world: QuizWorld,
  state: QuizState,
  result: MatchResult,
  input: string,
  now: number,
): { state: QuizState; event: TypeEvent } {
  if (!isOpen(state)) return { state, event: { kind: "over" } };
  switch (result.kind) {
    case "ignore":
      return { state, event: { kind: "ignored" } };
    case "try-english":
      return { state, event: { kind: "try-english" } };
    case "not-recognized":
      return { state, event: { kind: "not-recognized" } };
    case "hold":
      return { state, event: { kind: "hold", entityId: result.entityId, holdMs: result.holdMs } };
    case "ambiguous":
      return { state, event: { kind: "ambiguous", message: result.message } };
    case "not-in-quiz":
      return {
        state,
        event: {
          kind: "not-in-quiz",
          message: outReason(world, state, result.entityId, result.reason),
        },
      };
    case "already-named": {
      const name = world.byId.get(result.entityId)?.name ?? result.entityId;
      return { state, event: { kind: "already-named", itemId: result.entityId, name } };
    }
    case "wrong": {
      const cur = currentIndex(state);
      const s = begin(state, now);
      return {
        state: cur === null ? s : setItem(s, cur, { attempts: (s.items[cur]?.attempts ?? 0) + 1 }),
        event: { kind: "wrong", entityId: result.entityId, learn: result.learn },
      };
    }
    case "accept": {
      const s0 = begin(state, now);
      const idx =
        s0.quiz.config.format === "TYPE_ALL"
          ? s0.quiz.items.findIndex(
              (it, i) =>
                it.answerIds.includes(result.entityId) && s0.items[i]?.status === "pending",
            )
          : currentIndex(s0);
      if (idx === null || idx < 0) return { state: s0, event: { kind: "not-recognized" } };
      const item = s0.items[idx] as ItemState;
      const hinted = item.highlighted === true || item.hints > 0;
      const note: ItemNote | undefined = result.notes.includes("spelling-corrected")
        ? "spelling-corrected"
        : result.notes.includes("former-name")
          ? "former-name"
          : undefined;
      const score = learn(s0) ? 0 : hinted ? 0.5 : 1;
      let s = setItem(s0, idx, {
        status: "correct",
        score,
        attempts: item.attempts + 1,
        input,
        ...(note ? { note } : {}),
      });
      if (s.quiz.config.format !== "TYPE_ALL")
        s = { ...s, queue: s.queue.filter((q) => q !== idx) };
      return {
        state: finishIfDone(s, now),
        event: {
          kind: "accepted",
          itemId: s.quiz.items[idx]?.id as string,
          ...(note ? { note } : {}),
          via: result.via,
          text: result.alias.text,
        },
      };
    }
  }
}

/** Typed text: a keystroke runs exact matching only, Enter also runs fuzzy matching (quiz-library §5.1). */
export function submitText(
  world: QuizWorld,
  state: QuizState,
  input: string,
  opts: { submitted: boolean },
  now: number,
): { state: QuizState; event: TypeEvent } {
  if (!isOpen(state)) return { state, event: { kind: "over" } };
  return applyMatch(world, state, matchInput(world, state, input, opts.submitted), input, now);
}

// ---------------------------------------------------------------------------------------------------------------------
// Prompted formats

/** TYPE_PROMPTED Skip: the item goes to the back once. Skipping it again reveals it (quiz-library §2.2). */
export function skip(state: QuizState, now: number): QuizState {
  const cur = currentIndex(state);
  if (!isOpen(state) || cur === null || state.quiz.config.format !== "TYPE_PROMPTED") return state;
  const s0 = begin(state, now);
  const item = s0.items[cur] as ItemState;
  if (item.skipped || learn(s0)) {
    const s = setItem(s0, cur, { status: "revealed", score: 0 });
    return finishIfDone({ ...s, queue: s.queue.slice(1) }, now);
  }
  const s = setItem(s0, cur, { skipped: true });
  return { ...s, queue: [...s.queue.slice(1), cur] };
}

/** Whether Skip currently acts as Reveal. */
export const skipIsReveal = (s: QuizState): boolean => {
  const cur = currentIndex(s);
  return cur !== null && (s.items[cur]?.skipped === true || learn(s));
};

export type ClickEvent =
  | { kind: "correct"; score: number }
  | { kind: "wrong"; clickedId: string; triesLeft: number }
  | { kind: "missed"; answer: string[] }
  | { kind: "over" };

/** MAP_CLICK: three attempts per item, scoring 1, 0.5, 0.25 (and at most 0.5 after a hint). */
export function clickMap(
  state: QuizState,
  entityId: string,
  now: number,
): { state: QuizState; event: ClickEvent } {
  const cur = currentIndex(state);
  if (!isOpen(state) || cur === null || state.quiz.config.format !== "MAP_CLICK")
    return { state, event: { kind: "over" } };
  const s0 = begin(state, now);
  const q = s0.quiz.items[cur];
  const item = s0.items[cur] as ItemState;
  if (!q) return { state, event: { kind: "over" } };
  const attempt = item.attempts;
  if (q.mapIds.includes(entityId)) {
    const raw = MAP_CLICK_SCORES[Math.min(attempt, MAX_ATTEMPTS - 1)] as number;
    const score = learn(s0) ? 0 : item.hints > 0 ? Math.min(raw, 0.5) : raw;
    const s = setItem(s0, cur, { status: "correct", score, attempts: attempt + 1 });
    return {
      state: finishIfDone({ ...s, queue: s.queue.slice(1) }, now),
      event: { kind: "correct", score },
    };
  }
  const attempts = attempt + 1;
  if (attempts >= MAX_ATTEMPTS && !learn(s0)) {
    const s = setItem(s0, cur, { status: "missed", score: 0, attempts });
    return {
      state: finishIfDone({ ...s, queue: s.queue.slice(1) }, now),
      event: { kind: "missed", answer: q.mapIds },
    };
  }
  return {
    state: setItem(s0, cur, { attempts }),
    event: { kind: "wrong", clickedId: entityId, triesLeft: MAX_ATTEMPTS - attempts },
  };
}

export type ChoiceEvent =
  { kind: "correct"; score: number } | { kind: "wrong"; correctIndex: number } | { kind: "over" };

/** MULTIPLE_CHOICE: one attempt; 1 point, or 0.5 if the 50/50 hint was used. */
export function choose(
  state: QuizState,
  index: number,
  now: number,
): { state: QuizState; event: ChoiceEvent } {
  const cur = currentIndex(state);
  if (!isOpen(state) || cur === null || state.quiz.config.format !== "MULTIPLE_CHOICE")
    return { state, event: { kind: "over" } };
  const q = state.quiz.items[cur];
  const item = state.items[cur] as ItemState;
  if (
    !q?.options ||
    index < 0 ||
    index >= q.options.length ||
    item.removed?.includes(index) ||
    item.status !== "pending"
  )
    return { state, event: { kind: "over" } };
  const s0 = begin(state, now);
  const right = index === q.correctIndex;
  const score = learn(s0) || !right ? 0 : item.hints > 0 ? 0.5 : 1;
  const s = setItem(s0, cur, {
    status: right ? "correct" : "missed",
    score,
    attempts: 1,
    chosen: index,
  });
  return {
    state: finishIfDone({ ...s, queue: s.queue.slice(1) }, now),
    event: right
      ? { kind: "correct", score }
      : { kind: "wrong", correctIndex: q.correctIndex as number },
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Hints (quiz-library §7.1). Disabled on Hard and when the challenge turned them off.

export const hintsAllowed = (s: QuizState): boolean =>
  s.quiz.config.difficulty !== "hard" && s.quiz.config.hints !== false && !learn(s);

export type HintEvent =
  | { kind: "none" }
  | { kind: "highlight"; itemId: string }
  | { kind: "letter"; letter: string }
  | { kind: "blanks"; pattern: string }
  | { kind: "group"; name: string }
  | { kind: "zoom-region" }
  | { kind: "neighbors" }
  | { kind: "fifty"; removed: number[] };

const blanksFor = (name: string): string =>
  [...name]
    .map((c) => (/[A-Za-z0-9]/.test(c.normalize("NFKD").replace(/\p{M}/gu, "")) ? "_" : c))
    .join(" ");

/** Takes the next hint of the current format. Returns what to show and the new state. */
export function takeHint(
  world: QuizWorld,
  state: QuizState,
  now: number,
): { state: QuizState; event: HintEvent } {
  if (!isOpen(state) || !hintsAllowed(state)) return { state, event: { kind: "none" } };
  const s0 = begin(state, now);
  const { format } = s0.quiz.config;
  if (format === "TYPE_ALL") {
    if (s0.hintsUsed >= MAX_TYPE_ALL_HINTS) return { state, event: { kind: "none" } };
    const pending = s0.items
      .map((it, i) => (it.status === "pending" && !it.highlighted ? i : -1))
      .filter((i) => i >= 0);
    if (pending.length === 0) return { state, event: { kind: "none" } };
    const rng = new Rng(`${s0.quiz.seed}|hint|${s0.hintsUsed}`);
    const i = rng.pick(pending);
    return {
      state: { ...setItem(s0, i, { highlighted: true }), hintsUsed: s0.hintsUsed + 1 },
      event: { kind: "highlight", itemId: s0.quiz.items[i]?.id as string },
    };
  }
  const cur = currentIndex(s0);
  if (cur === null) return { state, event: { kind: "none" } };
  const q = s0.quiz.items[cur];
  const item = s0.items[cur] as ItemState;
  if (!q) return { state, event: { kind: "none" } };
  if (format === "TYPE_PROMPTED") {
    const answer = world.indexes[s0.quiz.universe];
    void answer;
    const answerName = (): string => {
      const id = q.answerIds[0] as string;
      if (s0.quiz.universe === "capital") return world.byId.get(id)?.capitals[0]?.name ?? id;
      return world.byId.get(id)?.name ?? world.groupById.get(id)?.name ?? id;
    };
    const level = item.hints + 1;
    if (level > 3) return { state, event: { kind: "none" } };
    const s = setItem(s0, cur, { hints: level });
    const name = answerName();
    if (level === 1)
      return { state: s, event: { kind: "letter", letter: (norm(name)[0] ?? "").toUpperCase() } };
    if (level === 2) return { state: s, event: { kind: "blanks", pattern: blanksFor(name) } };
    const e = world.byId.get(q.answerIds[0] as string);
    return {
      state: s,
      event: {
        kind: "group",
        name: e ? (world.groups.find((g) => g.id === `continent:${e.continent}`)?.name ?? "") : "",
      },
    };
  }
  if (format === "MAP_CLICK") {
    const level = item.hints + 1;
    if (level > 2) return { state, event: { kind: "none" } };
    return {
      state: setItem(s0, cur, { hints: level }),
      event: { kind: level === 1 ? "zoom-region" : "neighbors" },
    };
  }
  // MULTIPLE_CHOICE 50/50: once per 10 items.
  const allowed = Math.ceil(s0.quiz.items.length / 10);
  if (s0.fiftyUsed >= allowed || !q.options || item.removed || q.correctIndex === undefined)
    return { state, event: { kind: "none" } };
  const rng = new Rng(`${s0.quiz.seed}|fifty|${cur}`);
  const wrong = q.options.map((_, i) => i).filter((i) => i !== q.correctIndex);
  const removed = rng.shuffle(wrong).slice(0, 2).sort();
  return {
    state: { ...setItem(s0, cur, { removed, hints: 1 }), fiftyUsed: s0.fiftyUsed + 1 },
    event: { kind: "fifty", removed },
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Review

export type Summary = {
  points: number;
  total: number;
  /** Whole percent, round half up. */
  percent: number;
  usedMs: number;
  correct: number;
  missed: string[];
  spellingCorrected: string[];
  formerNames: string[];
};

export function summarize(s: QuizState, now: number): Summary {
  const total = s.quiz.items.length;
  const points = s.items.reduce((sum, it) => sum + it.score, 0);
  const ids = (pred: (it: ItemState) => boolean): string[] =>
    s.items.flatMap((it, i) => (pred(it) ? [s.quiz.items[i]?.id as string] : []));
  const used = elapsedMs(s.timer, now);
  return {
    points,
    total,
    percent: total === 0 ? 0 : Math.floor((100 * points) / total + 0.5),
    usedMs: Math.round(s.quiz.limitMs === null ? used : Math.min(used, s.quiz.limitMs)),
    correct: s.items.filter((it) => it.status === "correct").length,
    missed: ids(
      (it) => it.status === "missed" || it.status === "revealed" || it.status === "pending",
    ),
    spellingCorrected: ids((it) => it.note === "spelling-corrected"),
    formerNames: ids((it) => it.note === "former-name"),
  };
}

export type { Timer };
