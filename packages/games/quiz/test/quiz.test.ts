import { describe, expect, it } from "vitest";
import { onInput, onTick } from "@meridian/name-matcher";
import {
  ALLOWED_FORMATS,
  applyMatch,
  begin,
  choose,
  clickMap,
  currentIndex,
  generatePractice,
  generateQuiz,
  giveUp,
  isNewPb,
  masteryOutcomes,
  matchContext,
  matchInput,
  newQuizState,
  pause,
  pbKey,
  practicePlan,
  restoreQuiz,
  resume,
  skip,
  submitText,
  summarize,
  takeHint,
  tick,
  timeLeftMs,
  timeLimitMs,
  type QuizConfig,
} from "../src";
import { bigWorld, cfg, named, smallWorld } from "./helpers";

const world = smallWorld();
const start = (over: Partial<QuizConfig>, seed = "K7Q2M9XD1A", w = world) =>
  newQuizState(generateQuiz(w, cfg(over), seed));
const type = (s: ReturnType<typeof start>, text: string, submitted = true, now = 1000) =>
  submitText(world, s, text, { submitted }, now);

describe("time limits and PB keys", () => {
  it("AC-QZ-013: countries of the world TYPE_ALL is 13:15", () => {
    expect(timeLimitMs("TYPE_ALL", 197)).toBe(13 * 60_000 + 15_000);
    // The formula is normative: 20 × 10 s = 200 s rounds up to 210 s (the library table shows 3:20 for readability).
    expect(timeLimitMs("MULTIPLE_CHOICE", 20)).toBe(210_000);
    expect(timeLimitMs("MAP_CLICK", 7)).toBe(45_000);
    expect(timeLimitMs("TYPE_PROMPTED", 22)).toBe(210_000);
  });
  it("AC-QZ-022: an untimed run has its own PB bucket, and subsets have none", () => {
    const timed = pbKey(cfg(), 197);
    const untimed = pbKey(cfg({ timed: false }), 197);
    expect(timed).not.toBe(untimed);
    expect(timed).toBe("countries.by-name|world|TYPE_ALL|sovereign-197|197|timed");
    expect(pbKey(cfg({ count: 20 }), 20)).toBeNull();
    expect(pbKey(cfg({ learn: true }), 197)).toBeNull();
    const pbs = new Map([[timed!, { score: 80, activeMs: 700_000 }]]);
    expect(isNewPb(pbs.get(untimed!), { score: 100, activeMs: 900_000 })).toBe(true);
    expect(pbs.get(timed!)).toEqual({ score: 80, activeMs: 700_000 });
  });
  it("a better score wins and a tie goes to the shorter time", () => {
    const prev = { score: 80, activeMs: 700_000 };
    expect(isNewPb(prev, { score: 81, activeMs: 900_000 })).toBe(true);
    expect(isNewPb(prev, { score: 80, activeMs: 600_000 })).toBe(true);
    expect(isNewPb(prev, { score: 80, activeMs: 700_000 })).toBe(false);
    expect(isNewPb(prev, { score: 79, activeMs: 1 })).toBe(false);
  });
});

describe("generateQuiz (AC-QZ-015)", () => {
  const c = cfg({
    template: "flags.by-country",
    format: "MULTIPLE_CHOICE",
    count: 20,
    difficulty: "normal",
  });
  it("is deterministic: same items, order and distractors for the same seed", () => {
    const a = generateQuiz(bigWorld(), c, "K7Q2M9XD1A");
    const b = generateQuiz(bigWorld(), c, "K7Q2M9XD1A");
    expect(a).toEqual(b);
    expect(a.items).toHaveLength(20);
    expect(generateQuiz(bigWorld(), c, "K7Q2M9XD1B").items.map((i) => i.id)).not.toEqual(
      a.items.map((i) => i.id),
    );
  });
  it("every MC item has 4 distinct options containing exactly the right one", () => {
    for (const it of generateQuiz(bigWorld(), c, "K7Q2M9XD1A").items) {
      expect(new Set(it.options).size).toBe(4);
      expect(it.options![it.correctIndex!]).toBe(it.id);
    }
  });
  it("Normal uses 2 same-continent distractors, Easy none from the same continent", () => {
    const w = bigWorld();
    const cont = (id: string) => w.byId.get(id)!.continent;
    for (const it of generateQuiz(w, c, "SEED000001").items) {
      const same = it.options!.filter((o) => o !== it.id && cont(o) === cont(it.id)).length;
      expect(same).toBeGreaterThanOrEqual(2);
    }
    for (const it of generateQuiz(w, { ...c, difficulty: "easy" }, "SEED000002").items)
      expect(it.options!.filter((o) => o !== it.id && cont(o) === cont(it.id))).toEqual([]);
  });
  it("AC-QZ-019: on Hard, the flag confusables come first (Chad → Romania)", () => {
    const hard = generateQuiz(
      world,
      cfg({
        template: "flags.by-country",
        format: "MULTIPLE_CHOICE",
        difficulty: "hard",
        count: "all",
      }),
      "HARDSEED01",
    );
    const chad = hard.items.find((i) => i.id === "country:TCD")!;
    expect(chad.options).toContain("country:ROU");
  });
  it("orders alphabetically or largest first", () => {
    const alpha = generateQuiz(world, cfg({ order: "alphabetical" }), "ORDERSEED1").items.map(
      (i) => world.byId.get(i.id)!.name,
    );
    expect(alpha).toEqual([...alpha].sort((a, b) => a.localeCompare(b)));
    const large = generateQuiz(world, cfg({ order: "largest" }), "ORDERSEED1").items.map(
      (i) => world.byId.get(i.id)!.areaKm2,
    );
    expect(large).toEqual([...large].sort((a, b) => b - a));
  });
  it("scopes by continent and region, and rejects formats a template does not allow", () => {
    const africa = generateQuiz(
      world,
      cfg({ scope: { kind: "continent", id: "AF" } }),
      "SCOPESEED1",
    );
    expect(africa.items.every((i) => world.byId.get(i.id)!.continent === "AF")).toBe(true);
    expect(africa.items.length).toBe(
      world.entities.filter((e) => e.continent === "AF" && e.type === "country").length,
    );
    const west = generateQuiz(
      world,
      cfg({ scope: { kind: "region", id: "western-africa" } }),
      "SCOPESEED1",
    );
    expect(west.items.map((i) => i.id).sort()).toEqual(["country:NER", "country:NGA"]);
    expect(() =>
      generateQuiz(world, cfg({ template: "countries.by-capital", format: "TYPE_ALL" }), "X"),
    ).toThrow(RangeError);
    expect(Object.values(ALLOWED_FORMATS).every((f) => f.length > 0)).toBe(true);
  });
  it("continents and regions quizzes are made of groups, clicked through their member countries", () => {
    const q = generateQuiz(
      world,
      cfg({ template: "continents.by-name", format: "MAP_CLICK", timed: true }),
      "GROUPSEED1",
    );
    expect(q.items).toHaveLength(6);
    const africa = q.items.find((i) => i.id === "continent:AF")!;
    expect(africa.mapIds).toContain("country:NER");
    expect(q.limitMs).toBe(45_000);
    const mc = generateQuiz(
      world,
      cfg({ template: "continents.by-name", format: "MULTIPLE_CHOICE" }),
      "GROUPSEED1",
    );
    expect(mc.items[0]!.options).toHaveLength(4);
  });
  it("countries-by-continent offers continents as options", () => {
    const q = generateQuiz(
      world,
      cfg({ template: "countries.by-continent", format: "MULTIPLE_CHOICE", count: 5 }),
      "CBCSEED001",
    );
    for (const it of q.items)
      expect(it.options![it.correctIndex!]).toBe(`continent:${world.byId.get(it.id)!.continent}`);
  });
  it("AC-QZ-016: down-weighting keeps consecutive 20-of-197 rounds mostly different", () => {
    const w = bigWorld();
    const config = cfg({ count: 20, format: "TYPE_PROMPTED" });
    let history: string[][] = [];
    let overlap = 0;
    let prev = new Set<string>();
    let uniformOverlap = 0;
    let prevU = new Set<string>();
    const rounds = 400;
    for (let i = 0; i < rounds; i++) {
      const ids = generateQuiz(w, config, `R${String(i).padStart(9, "0")}`, history).items.map(
        (x) => x.id,
      );
      overlap += ids.filter((id) => prev.has(id)).length;
      prev = new Set(ids);
      history = [...history, ids].slice(-20);
      const u = generateQuiz(w, config, `R${String(i).padStart(9, "0")}`, []).items.map(
        (x) => x.id,
      );
      uniformOverlap += u.filter((id) => prevU.has(id)).length;
      prevU = new Set(u);
    }
    expect(overlap / (rounds - 1)).toBeLessThanOrEqual(1.0);
    expect(uniformOverlap / (rounds - 1)).toBeGreaterThan(1.5);
  });
  it("Easy weights subsets toward easy items and Hard toward hard ones", () => {
    const w = bigWorld();
    const mean = (d: "easy" | "hard") => {
      let sum = 0;
      for (let i = 0; i < 40; i++)
        for (const it of generateQuiz(
          w,
          cfg({ count: 20, format: "TYPE_PROMPTED", difficulty: d }),
          `D${i}${d}0000000`.slice(0, 10),
        ).items)
          sum += w.byId.get(it.id)!.difficulty.recall ?? 0.5;
      return sum / 800;
    };
    expect(mean("easy")).toBeLessThan(mean("hard") - 0.1);
  });
});

describe("TYPE_ALL (AC-QZ-001..009)", () => {
  const s0 = start({});
  it("AC-QZ-001: an exact alias of a remaining item is accepted on a keystroke, without Enter", () => {
    const r = type(s0, "paraguai", false);
    expect(r.event).toMatchObject({ kind: "accepted", itemId: "country:PRY", via: "exact" });
    expect(r.state.items.filter((i) => i.status === "correct")).toHaveLength(1);
    expect(r.state.phase).toBe("playing");
    expect(summarize(r.state, 2000).percent).toBe(Math.floor(100 / s0.items.length + 0.5));
  });
  it("AC-QZ-003: fuzzy matching runs on Enter only", () => {
    expect(type(s0, "kyrgystan", false).event.kind).toBe("not-recognized");
    const r = type(s0, "kyrgystan", true);
    expect(r.event).toMatchObject({ kind: "accepted", note: "spelling-corrected", via: "fuzzy" });
    expect(r.state.items[r.state.quiz.items.findIndex((i) => i.id === "country:KGZ")]!.note).toBe(
      "spelling-corrected",
    );
  });
  it("AC-QZ-005: prefix-hold: 'niger' is held, accepted after 700 ms, and 'nigeria' accepts Nigeria at once", () => {
    const ctx = matchContext(s0);
    const first = onInput(world.indexes.country, "niger", ctx, 0, null);
    expect(first.result.kind).toBe("hold");
    expect(onTick(world.indexes.country, "niger", ctx, 600, first.hold)).toBeNull();
    const held = onTick(world.indexes.country, "niger", ctx, 700, first.hold);
    expect(held).toMatchObject({ kind: "accept", entityId: "country:NER" });
    const a = applyMatch(world, s0, held!, "niger", 700);
    expect(a.event).toMatchObject({ kind: "accepted", itemId: "country:NER" });
    const n = type(s0, "nigeria", false);
    expect(n.event).toMatchObject({ kind: "accepted", itemId: "country:NGA" });
    expect(n.state.items.find((_, i) => n.state.quiz.items[i]!.id === "country:NER")!.status).toBe(
      "pending",
    );
  });
  it("AC-QZ-006/007: 'congo' is ambiguous while both remain, and resolves once one is named", () => {
    const r = type(s0, "congo", false);
    expect(r.event).toMatchObject({ kind: "ambiguous" });
    expect((r.event as { message: string }).message).toContain("Which Congo?");
    expect(r.state.items.filter((i) => i.status === "correct")).toHaveLength(0);
    const one = type(s0, "dr congo", false).state;
    expect(type(one, "congo", false).event).toMatchObject({
      kind: "accepted",
      itemId: "country:COG",
    });
  });
  it("AC-QZ-008: 'greenland' is not in a sovereign-197 quiz, with a reason, and nothing changes", () => {
    const r = type(s0, "greenland", false);
    expect(r.event.kind).toBe("not-in-quiz");
    expect((r.event as { message: string }).message).toMatch(/^Not in this quiz: Greenland/);
    expect(r.state.items.every((i) => i.status === "pending")).toBe(true);
  });
  it("AC-QZ-009: naming France twice shows 'Already named: France' and scores nothing more", () => {
    const once = type(s0, "france", false).state;
    const twice = type(once, "france", false);
    expect(twice.event).toMatchObject({ kind: "already-named", name: "France" });
    expect(summarize(twice.state, 2000).points).toBe(1);
  });
  it("AC-QZ-021: a former name is accepted with a note ('burma' → Myanmar)", () => {
    const r = type(s0, "burma", false);
    expect(r.event).toMatchObject({ kind: "accepted", itemId: "country:MMR", note: "former-name" });
    const sum = summarize(r.state, 2000);
    expect(sum.formerNames).toEqual(["country:MMR"]);
  });
  it("AC-QZ-023: non-Latin input says to try the English name", () => {
    expect(type(s0, "日本", false).event.kind).toBe("try-english");
    expect(type(s0, "   ", false).event.kind).toBe("ignored");
  });
  it("naming everything completes the quiz", () => {
    let s = s0;
    for (const e of world.entities.filter((x) => x.sets.includes("sovereign-197")))
      s = type(s, e.name, true).state;
    expect(s.phase).toBe("review");
    expect(s.endReason).toBe("complete");
    expect(summarize(s, 5000).percent).toBe(100);
  });
  it("the hint highlights an unnamed item (max 5) and a highlighted item scores 0.5", () => {
    let s = s0;
    const seen = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const h = takeHint(world, s, 1000);
      expect(h.event.kind).toBe("highlight");
      seen.add((h.event as { itemId: string }).itemId);
      s = h.state;
    }
    expect(seen.size).toBe(5);
    expect(takeHint(world, s, 1000).event.kind).toBe("none");
    const id = [...seen][0]!;
    const name = world.byId.get(id)!.name;
    expect(summarize(type(s, name, true).state, 2000).points).toBe(0.5);
  });
  it("hints are off on Hard, in Learn mode and when a challenge disabled them", () => {
    for (const over of [{ difficulty: "hard" as const }, { learn: true }, { hints: false }])
      expect(takeHint(world, start(over), 0).event.kind).toBe("none");
  });
});

describe("TYPE_PROMPTED", () => {
  const cfgP = cfg({ format: "TYPE_PROMPTED", count: "all" });
  const s0 = newQuizState(generateQuiz(world, cfgP, "PROMPTSEED"));
  const cur = (s: typeof s0) => s.quiz.items[currentIndex(s)!]!;
  const nameOf = (s: typeof s0) => world.byId.get(cur(s).answerIds[0]!)!.name;

  it("accepts the prompt's answer and advances; a wrong entity keeps the item and counts an attempt", () => {
    const other = world.entities.find((e) => e.id !== cur(s0).id)!;
    const w = submitText(world, s0, other.name, { submitted: true }, 100);
    expect(w.event).toMatchObject({ kind: "wrong" });
    expect(currentIndex(w.state)).toBe(currentIndex(s0));
    const a = submitText(world, w.state, nameOf(s0), { submitted: true }, 200);
    expect(a.event.kind).toBe("accepted");
    expect(currentIndex(a.state)).not.toBe(currentIndex(s0));
    expect(a.state.items[currentIndex(s0)!]!.score).toBe(1);
  });
  it("AC-QZ-004: with Niger asked, 'nigeria' is wrong, never fuzzy-accepted as Niger", () => {
    const s = {
      ...s0,
      queue: [
        s0.quiz.items.findIndex((i) => i.id === "country:NER"),
        ...s0.queue.filter((q) => s0.quiz.items[q]!.id !== "country:NER"),
      ],
    };
    expect(submitText(world, s, "nigeria", { submitted: true }, 0).event).toMatchObject({
      kind: "wrong",
      entityId: "country:NGA",
    });
  });
  it("Skip moves the item to the back once, then becomes Reveal (score 0)", () => {
    const first = currentIndex(s0)!;
    const a = skip(s0, 0);
    expect(currentIndex(a)).not.toBe(first);
    expect(a.queue[a.queue.length - 1]).toBe(first);
    let s = a;
    while (currentIndex(s) !== first) s = skip(s, 0);
    const r = skip(s, 0);
    expect(r.items[first]).toMatchObject({ status: "revealed", score: 0 });
    expect(r.queue).not.toContain(first);
  });
  it("hints: first letter, then blanks, then continent, and the item scores 0.5", () => {
    const h1 = takeHint(world, s0, 0);
    const name = nameOf(s0);
    expect(h1.event).toEqual({ kind: "letter", letter: name[0]!.toUpperCase() });
    const h2 = takeHint(world, h1.state, 0);
    expect(h2.event.kind).toBe("blanks");
    expect((h2.event as { pattern: string }).pattern.replaceAll(" ", "")).toHaveLength(
      name.replaceAll(" ", "").length,
    );
    expect(takeHint(world, h2.state, 0).event.kind).toBe("group");
    expect(
      takeHint(world, takeHint(world, takeHint(world, h2.state, 0).state, 0).state, 0).event.kind,
    ).toBe("none");
    const ok = submitText(world, h1.state, name, { submitted: true }, 0).state;
    expect(ok.items[currentIndex(s0)!]!.score).toBe(0.5);
  });
  it("AC-QZ-018: capitals accept every capital, with roles (Bolivia: Sucre and La Paz)", () => {
    const q = generateQuiz(
      world,
      cfg({ template: "capitals.by-country", format: "TYPE_PROMPTED", count: "all" }),
      "CAPSEED001",
    );
    const s = newQuizState(q);
    const bol = q.items.findIndex((i) => i.id === "country:BOL");
    const at = (name: string) =>
      submitText(
        world,
        { ...s, queue: [bol, ...s.queue.filter((x) => x !== bol)] },
        name,
        { submitted: true },
        0,
      ).event;
    expect(at("la paz")).toMatchObject({ kind: "accepted" });
    expect(at("sucre")).toMatchObject({ kind: "accepted" });
    expect(at("asuncion")).toMatchObject({ kind: "wrong" });
    expect(world.byId.get("country:BOL")!.capitals.map((c) => `${c.name}:${c.role}`)).toEqual([
      "Sucre:official",
      "La Paz:seat_of_government",
    ]);
  });
  it("countries-by-capital prompts the capital and takes the country", () => {
    const q = generateQuiz(
      world,
      cfg({ template: "countries.by-capital", format: "TYPE_PROMPTED", count: "all" }),
      "CBCSEED002",
    );
    const it = q.items.find((i) => i.id === "country:URY")!;
    expect(it.prompt).toEqual({ kind: "text", text: "Montevideo" });
  });
});

describe("MAP_CLICK (AC-QZ-010)", () => {
  const q = generateQuiz(world, cfg({ format: "MAP_CLICK", count: "all" }), "MAPSEED001");
  const at = (s: ReturnType<typeof newQuizState>, id: string) => {
    const i = s.quiz.items.findIndex((x) => x.id === id);
    return { ...s, queue: [i, ...s.queue.filter((x) => x !== i)] };
  };
  it("first click scores 1, second 0.5, third 0.25", () => {
    for (const [wrongs, score] of [
      [0, 1],
      [1, 0.5],
      [2, 0.25],
    ] as const) {
      let s = at(newQuizState(q), "country:PRY");
      for (let i = 0; i < wrongs; i++) s = clickMap(s, "country:URY", 0).state;
      const r = clickMap(s, "country:PRY", 0);
      expect(r.event).toEqual({ kind: "correct", score });
    }
  });
  it("AC-QZ-010: Uruguay then Paraguay scores 0.5 and the first click names the wrong country", () => {
    const s = at(newQuizState(q), "country:PRY");
    const wrong = clickMap(s, "country:URY", 0);
    expect(wrong.event).toEqual({ kind: "wrong", clickedId: "country:URY", triesLeft: 2 });
    const right = clickMap(wrong.state, "country:PRY", 0);
    expect(right.state.items[q.items.findIndex((i) => i.id === "country:PRY")]!.score).toBe(0.5);
  });
  it("three misses end the item as missed and advance", () => {
    let s = at(newQuizState(q), "country:PRY");
    const idx = q.items.findIndex((i) => i.id === "country:PRY");
    s = clickMap(s, "country:URY", 0).state;
    s = clickMap(s, "country:BRA", 0).state;
    const r = clickMap(s, "country:URY", 0);
    expect(r.event).toMatchObject({ kind: "missed", answer: ["country:PRY"] });
    expect(r.state.items[idx]).toMatchObject({ status: "missed", score: 0 });
    expect(r.state.queue).not.toContain(idx);
  });
  it("hints cap the item at 0.5, and a continent is found by clicking any member country", () => {
    let s = at(newQuizState(q), "country:PRY");
    s = takeHint(world, s, 0).state;
    expect(clickMap(s, "country:PRY", 0).event).toEqual({ kind: "correct", score: 0.5 });
    const cq = generateQuiz(
      world,
      cfg({ template: "continents.by-name", format: "MAP_CLICK" }),
      "MAPSEED002",
    );
    let cs = newQuizState(cq);
    const i = cq.items.findIndex((x) => x.id === "continent:AF");
    cs = { ...cs, queue: [i, ...cs.queue.filter((x) => x !== i)] };
    expect(clickMap(cs, "country:TCD", 0).event.kind).toBe("correct");
  });
});

describe("MULTIPLE_CHOICE", () => {
  const q = generateQuiz(
    world,
    cfg({ template: "capitals.by-country", format: "MULTIPLE_CHOICE", count: 10 }),
    "MCSEED0001",
  );
  it("one attempt: right is 1, wrong is 0 and shows the answer", () => {
    const s = newQuizState(q);
    const it = q.items[currentIndex(s)!]!;
    expect(choose(s, it.correctIndex!, 0).event).toEqual({ kind: "correct", score: 1 });
    const wrong = choose(s, (it.correctIndex! + 1) % 4, 0);
    expect(wrong.event).toEqual({ kind: "wrong", correctIndex: it.correctIndex });
    expect(wrong.state.items[currentIndex(s)!]!.status).toBe("missed");
    expect(choose(wrong.state, 0, 0).state.items[currentIndex(s)!]!.attempts).toBe(1);
  });
  it("50/50 removes two wrong options, scores 0.5, and is allowed once per 10 items", () => {
    const s = newQuizState(q);
    const h = takeHint(world, s, 0);
    const ev = h.event as { kind: "fifty"; removed: number[] };
    expect(ev.kind).toBe("fifty");
    const it = q.items[currentIndex(s)!]!;
    expect(ev.removed).toHaveLength(2);
    expect(ev.removed).not.toContain(it.correctIndex);
    expect(choose(h.state, ev.removed[0]!, 0).event.kind).toBe("over");
    expect(choose(h.state, it.correctIndex!, 0).event).toEqual({ kind: "correct", score: 0.5 });
    const next = choose(h.state, it.correctIndex!, 0).state;
    expect(takeHint(world, next, 0).event.kind).toBe("none");
  });
  it("AC-QZ-024: 10 questions are answerable with the number keys alone, reaching review", () => {
    let s = newQuizState(q);
    for (let i = 0; i < 10; i++) s = choose(s, q.items[currentIndex(s)!]!.correctIndex!, i).state;
    expect(s.phase).toBe("review");
    expect(summarize(s, 99).percent).toBe(100);
  });
});

describe("clock, give up and review", () => {
  it("the clock starts at the first input and pauses and resumes", () => {
    let s = start({});
    expect(s.phase).toBe("ready");
    s = type(s, "france", false, 1000).state;
    expect(s.phase).toBe("playing");
    expect(timeLeftMs(s, 4000)).toBe(s.quiz.limitMs! - 3000);
    s = pause(s, 4000);
    expect(timeLeftMs(s, 90_000)).toBe(s.quiz.limitMs! - 3000);
    s = resume(s, 90_000);
    expect(timeLeftMs(s, 91_000)).toBe(s.quiz.limitMs! - 4000);
  });
  it("AC-QZ-012: a reload restores the same items and the time within a second", () => {
    let s = start({});
    s = type(s, "france", false, 1000).state;
    s = type(s, "chad", false, 5000).state;
    // pagehide pauses the clock before the state is saved.
    const saved = JSON.parse(JSON.stringify(pause(s, 5000))) as typeof s;
    const back = restoreQuiz(saved);
    expect(back.phase).toBe("paused");
    expect(back.items.filter((i) => i.status === "correct")).toHaveLength(2);
    expect(back.queue).toEqual(s.queue);
    const resumed = resume(back, 100_000);
    expect(Math.abs(timeLeftMs(resumed, 100_000)! - (s.quiz.limitMs! - 4000))).toBeLessThan(1000);
  });
  it("time running out ends the quiz as a timeout", () => {
    let s = type(start({}), "france", false, 0).state;
    expect(tick(s, s.quiz.limitMs! - 1).phase).toBe("playing");
    s = tick(s, s.quiz.limitMs!);
    expect(s).toMatchObject({ phase: "review", endReason: "timeout" });
  });
  it("untimed and Learn have no limit", () => {
    expect(start({ timed: false }).quiz.limitMs).toBeNull();
    expect(start({ learn: true }).quiz.limitMs).toBeNull();
    expect(timeLeftMs(start({ timed: false }), 5)).toBeNull();
  });
  it("AC-QZ-014: giving up marks everything left as missed, listed in the review", () => {
    let s = start({});
    for (const n of ["France", "Chad", "Brazil"]) s = type(s, n, true).state;
    s = giveUp(s, 9000);
    const sum = summarize(s, 9000);
    expect(s.endReason).toBe("give_up");
    expect(sum.correct).toBe(3);
    expect(sum.missed).toHaveLength(s.items.length - 3);
    expect(s.items.filter((i) => i.status === "missed")).toHaveLength(sum.missed.length);
    expect(sum.percent).toBe(Math.floor(300 / s.items.length + 0.5));
  });
  it("Learn mode scores nothing and reveals on Skip", () => {
    let s = newQuizState(
      generateQuiz(world, cfg({ format: "TYPE_PROMPTED", learn: true }), "LEARNSEED1"),
    );
    const name = world.byId.get(s.quiz.items[currentIndex(s)!]!.answerIds[0]!)!.name;
    s = submitText(world, s, name, { submitted: true }, 0).state;
    expect(summarize(s, 0).points).toBe(0);
    expect(skip(s, 0).items.some((i) => i.status === "revealed")).toBe(true);
  });
  it("percent rounds half up: 16.75 of 20 shows 84%", () => {
    const s = start({ format: "MAP_CLICK", count: 20 }, "ROUNDSEED1", bigWorld());
    const scores = [...Array(15).fill(1), 0.5, 0.5, 0.5, 0.25, 0];
    const fake = {
      ...s,
      items: s.items.map((it, i) => ({ ...it, score: scores[i]!, status: "correct" as const })),
    };
    expect(summarize(fake, 0).points).toBe(16.75);
    expect(summarize(fake, 0).percent).toBe(84);
  });
  it("the matcher can be used directly for keystroke previews", () => {
    expect(matchInput(world, start({}), "france", false).kind).toBe("accept");
    const done = begin(start({}), 0);
    expect(done.phase).toBe("playing");
    expect(begin(done, 5)).toBe(done);
  });
});

describe("practice my misses (AC-QZ-017)", () => {
  const rows = (items: [string, number, number][]) =>
    items.map(([id, m, due]) => ({ entityId: id, skill: "locate", mastery: m, dueAt: due }));
  const pool = world.entities
    .filter((e) => e.continent === "OC" || e.continent === "AF")
    .map((e) => e.id);
  it("includes all weak items first, most overdue first, then pads to 5 and says how many were added", () => {
    const plan = practicePlan(
      rows([
        ["country:TUV", 0.3, 5],
        ["country:NRU", 0.4, 1],
        ["country:PLW", 0.5, 9],
        ["country:NGA", 0.9, 2],
        ["country:TCD", 0.8, 3],
      ]),
      "locate",
      pool,
    );
    expect(plan.ids.slice(0, 3)).toEqual(["country:NRU", "country:TUV", "country:PLW"]);
    expect(plan.ids).toHaveLength(5);
    expect(plan).toMatchObject({ weak: 3, added: 2 });
    expect(plan.ids.slice(3)).toEqual(["country:TCD", "country:NGA"]);
  });
  it("with many weak items there is no padding", () => {
    const many = rows(pool.slice(0, 8).map((id, i) => [id, 0.2, i] as [string, number, number]));
    const plan = practicePlan(many, "locate", pool);
    expect(plan).toMatchObject({ weak: 8, added: 0 });
  });
  it("pads from never-played items when there is no mastery data at all", () => {
    const plan = practicePlan([], "locate", pool);
    expect(plan.ids).toHaveLength(5);
    expect(plan.added).toBe(5);
  });
  it("builds a quiz over exactly those items, in any format", () => {
    const plan = practicePlan(
      rows([
        ["country:TUV", 0.3, 5],
        ["country:NRU", 0.4, 1],
        ["country:PLW", 0.5, 9],
      ]),
      "locate",
      pool,
    );
    const quiz = generatePractice(
      world,
      cfg({ format: "MAP_CLICK", scope: { kind: "continent", id: "OC" } }),
      "PRACTICE01",
      plan,
    );
    expect(quiz.items.map((i) => i.id).sort()).toEqual(
      ["country:NRU", "country:PLW", "country:TUV"].sort(),
    );
    expect(quiz.config.count).toBe(3);
  });
  it("mastery outcomes come from answered country items, never from Learn mode or groups", () => {
    let s = start({ format: "MAP_CLICK", scope: { kind: "continent", id: "OC" } }, "OUTCOME001");
    const i = currentIndex(s)!;
    s = clickMap(s, s.quiz.items[i]!.id, 0).state;
    const out = masteryOutcomes(s);
    expect(out).toEqual([
      { entityId: s.quiz.items[i]!.id, skill: "locate", itemScore: 1, correct: true },
    ]);
    expect(masteryOutcomes(start({ learn: true }))).toEqual([]);
    expect(
      masteryOutcomes(
        newQuizState(
          generateQuiz(
            world,
            cfg({ template: "continents.by-name", format: "MAP_CLICK" }),
            "OUTCOME002",
          ),
        ),
      ),
    ).toEqual([]);
  });
});

void named;
