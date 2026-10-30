import { readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  HOLD_MS,
  NameIndex,
  boundedDistance,
  fuzzyThreshold,
  norm,
  onInput,
  onSubmit,
  onTick,
  type AmbiguityGroup,
  type Hold,
  type MatchContext,
  type MatchEntity,
  type MatchResult,
} from "../src/index";

const read = (f: string): string => readFileSync(new URL(`./${f}`, import.meta.url), "utf8");

/** Minimal RFC 4180 reader for the golden CSVs (quoted fields, doubled quotes, embedded newlines). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i] as string;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

type Fixture = { entities: MatchEntity[]; groups: AmbiguityGroup[] };
type RawCtx = Omit<MatchContext, "remaining" | "named" | "promptAnswers" | "inQuiz"> & {
  remaining: string[];
  named: string[];
  promptAnswers?: string[];
  inQuiz: string[];
};

const fixture = JSON.parse(read("fixtures/universe.json")) as Fixture;
const rawContexts = JSON.parse(read("fixtures/contexts.json")) as Record<string, RawCtx>;
const index = new NameIndex(fixture.entities, fixture.groups);

const ctxOf = (name: string): MatchContext => {
  const c = rawContexts[name];
  if (!c) throw new Error(`unknown context ${name}`);
  return {
    ...c,
    remaining: new Set(c.remaining),
    named: new Set(c.named),
    inQuiz: new Set(c.inQuiz),
    ...(c.promptAnswers ? { promptAnswers: new Set(c.promptAnswers) } : {}),
  } as MatchContext;
};

/** Render a result in the golden CSV's compact form. */
function render(r: MatchResult): string {
  const id = (e: string): string => e.split(":")[1] ?? e;
  switch (r.kind) {
    case "accept": {
      const flags = [
        r.via === "fuzzy" ? "fuzzy" : "",
        r.notes.includes("former-name") ? "former" : "",
      ].filter(Boolean);
      return `accept:${id(r.entityId)}${flags.map((f) => `+${f}`).join("")}`;
    }
    case "hold":
      return `hold:${id(r.entityId)}`;
    case "ambiguous":
      return `ambiguous:${r.group}`;
    case "already-named":
      return `already:${id(r.entityId)}`;
    case "not-in-quiz":
      return `notinquiz:${id(r.entityId)}`;
    case "wrong":
      return `wrong:${id(r.entityId)}${r.learn ? "+learn" : ""}`;
    case "not-recognized":
      return "notrec";
    case "try-english":
      return "english";
    case "ignore":
      return "ignore";
  }
}

/** Normalize the order of "+fuzzy+former" flags for comparison. */
const canon = (s: string): string => {
  const [head, ...flags] = s.split("+");
  return [head, ...flags.sort()].join("+");
};

describe("norm", () => {
  const rows = parseCsv(read("norm.golden.csv")).slice(1);
  it("norm.golden.csv has at least 90 rows", () => expect(rows.length).toBeGreaterThanOrEqual(90));
  for (const [id, input, key] of rows) {
    it(`golden norm #${id}: ${JSON.stringify(input)}`, () =>
      expect(norm(input as string)).toBe(key));
  }

  it("AC-QZ-002 diacritic, case, punctuation and article variants give identical keys", () => {
    for (const v of ["Côte d’Ivoire", "cote divoire", "COTE D'IVOIRE", "Cote d'Ivoire"])
      expect(norm(v)).toBe("cotedivoire");
    expect(norm("The Gambia")).toBe("gambia");
  });

  it("only ever emits [a-z0-9] (property)", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 120 }), (s) => {
        const k = norm(s);
        expect(k).toMatch(/^[a-z0-9]*$/);
      }),
    );
  });
});

describe("boundedDistance", () => {
  // Reference: textbook optimal-string-alignment distance without early exit.
  function osa(a: string, b: string): number {
    const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
      Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
    );
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
          d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1);
      }
    }
    return d[a.length]![b.length]!;
  }
  it("matches the reference when within the cutoff and exceeds it otherwise (property)", () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[abc]{0,10}$/),
        fc.stringMatching(/^[abc]{0,10}$/),
        fc.integer({ min: 0, max: 4 }),
        (a, b, cutoff) => {
          const ref = osa(a, b);
          const got = boundedDistance(a, b, cutoff);
          if (ref <= cutoff) expect(got).toBe(ref);
          else expect(got).toBeGreaterThan(cutoff);
        },
      ),
      { numRuns: 500 },
    );
  });
  it("counts an adjacent transposition as one edit", () => {
    expect(boundedDistance("ab", "ba", 2)).toBe(1);
    expect(boundedDistance("kyrgystan", "kyrgyzstan", 3)).toBe(1);
  });
  it("fuzzyThreshold table (quiz-library §5.1)", () => {
    const t = (n: number) => [
      fuzzyThreshold(n, "lenient"),
      fuzzyThreshold(n, "standard"),
      fuzzyThreshold(n, "strict"),
    ];
    expect(t(4)).toEqual([0, 0, 0]);
    expect(t(5)).toEqual([1, 1, 0]);
    expect(t(7)).toEqual([1, 1, 0]);
    expect(t(8)).toEqual([3, 2, 0]);
    expect(t(12)).toEqual([3, 2, 0]);
    expect(t(13)).toEqual([4, 3, 0]);
    expect(t(40)).toEqual([4, 3, 0]);
  });
});

describe("name-matching.golden.csv", () => {
  const rows = parseCsv(read("name-matching.golden.csv")).slice(1);
  it("has at least 300 rows", () => expect(rows.length).toBeGreaterThanOrEqual(300));
  for (const [id, input, submitted, context, expected] of rows) {
    it(`golden #${id}: ${JSON.stringify((input as string).slice(0, 30))} [${context}${submitted === "1" ? ", Enter" : ""}]`, () => {
      const got = render(
        index.match(input as string, ctxOf(context as string), { submitted: submitted === "1" }),
      );
      expect(canon(got)).toBe(canon(expected as string));
    });
  }
});

describe("acceptance criteria", () => {
  const all = ctxOf("all");

  it("AC-QZ-001 an exact alias of a remaining item is accepted on the keystroke path within one frame", () => {
    const t0 = performance.now();
    let r: MatchResult | undefined;
    for (let i = 0; i < 200; i++) r = index.match("ivory coast", all, { submitted: false });
    const perCall = (performance.now() - t0) / 200;
    expect(r).toMatchObject({ kind: "accept", entityId: "country:CIV", via: "exact" });
    expect(perCall).toBeLessThan(16);
  });

  it("AC-QZ-003 fuzzy matching accepts within threshold on Enter only", () => {
    expect(index.match("kyrgystan", all, { submitted: true })).toMatchObject({
      kind: "accept",
      entityId: "country:KGZ",
      via: "fuzzy",
      notes: ["spelling-corrected"],
    });
    expect(index.match("kyrgystan", all, { submitted: false }).kind).not.toBe("accept");
  });

  it("AC-QZ-004 fuzzy matching never rescues an exact match to another entity, and rejects ties", () => {
    expect(index.match("nigeria", ctxOf("p-ner"), { submitted: true })).toMatchObject({
      kind: "wrong",
      entityId: "country:NGA",
    });
    expect(index.match("nigera", all, { submitted: true }).kind).toBe("not-recognized");
  });

  it("AC-QZ-005 prefix-hold: niger waits 700 ms, nigeria typed quickly wins", () => {
    // Player types n-i-g-e-r and pauses.
    let hold: Hold = null;
    let out = onInput(index, "niger", all, 1000, hold);
    expect(out.result).toMatchObject({ kind: "hold", entityId: "country:NER", holdMs: HOLD_MS });
    hold = out.hold;
    expect(onTick(index, "niger", all, 1699, hold)).toBeNull();
    expect(onTick(index, "niger", all, 1700, hold)).toMatchObject({
      kind: "accept",
      entityId: "country:NER",
    });
    // Instead the player keeps typing: nigeri → nothing, nigeria → Nigeria. Niger remains.
    out = onInput(index, "nigeri", all, 1100, hold);
    expect(out.result.kind).toBe("not-recognized");
    expect(out.hold).toBeNull();
    out = onInput(index, "nigeria", all, 1200, out.hold);
    expect(out.result).toMatchObject({ kind: "accept", entityId: "country:NGA" });
    // Enter on the held input accepts immediately.
    expect(onSubmit(index, "niger", all)).toMatchObject({
      kind: "accept",
      entityId: "country:NER",
    });
  });

  it("AC-QZ-005 holding restarts its clock only when the held entity changes", () => {
    let out = onInput(index, "dominica", all, 0, null);
    out = onInput(index, "dominica", all, 400, out.hold);
    expect(out.hold).toEqual({ entityId: "country:DMA", since: 0 });
    expect(onTick(index, "dominica", all, 700, out.hold)).toMatchObject({
      kind: "accept",
      entityId: "country:DMA",
    });
  });

  it("AC-QZ-005 once the longer item is named the hold no longer applies", () => {
    expect(index.match("niger", ctxOf("nga-named"), { submitted: false })).toMatchObject({
      kind: "accept",
      entityId: "country:NER",
    });
  });

  it("AC-QZ-006 ambiguity group: both Congos remaining → message, nothing accepted", () => {
    const r = index.match("congo", all, { submitted: false });
    expect(r.kind).toBe("ambiguous");
    expect(r.kind === "ambiguous" && r.message).toContain("Which Congo?");
  });

  it("AC-QZ-007 ambiguity resolves when only one member remains", () => {
    expect(index.match("congo", ctxOf("cod-named"), { submitted: false })).toMatchObject({
      kind: "accept",
      entityId: "country:COG",
    });
  });

  it("AC-QZ-008 out-of-set message carries the reason and leaves the counter alone", () => {
    const r = index.match("greenland", all, { submitted: false });
    expect(r).toEqual({
      kind: "not-in-quiz",
      entityId: "country:GRL",
      reason: "Greenland is an autonomous territory of Denmark.",
    });
  });

  it("AC-QZ-009 already named: second time is a message, not a score", () => {
    expect(index.match("france", ctxOf("fra-gbr-named"), { submitted: false })).toEqual({
      kind: "already-named",
      entityId: "country:FRA",
    });
  });

  it("AC-QZ-021 former names are accepted with a note", () => {
    const r = index.match("burma", all, { submitted: false });
    expect(r).toMatchObject({ kind: "accept", entityId: "country:MMR", notes: ["former-name"] });
  });

  it("AC-QZ-023 non-Latin input in R1 → try the English name, no acceptance", () => {
    expect(index.match("日本", all, { submitted: true })).toEqual({ kind: "try-english" });
    expect(index.match("日本", all, { submitted: false })).toEqual({ kind: "try-english" });
  });

  it("emoji and symbols normalize to an empty key and are ignored", () => {
    expect(index.match("😀!!", all, { submitted: true })).toEqual({ kind: "ignore" });
  });

  it("fuzzy matching stays under 20 ms on a 2,000-entity universe", () => {
    const names = [
      "Alpha",
      "Bravo",
      "Charlie",
      "Delta",
      "Echo",
      "Foxtrot",
      "Golf",
      "Hotel",
      "India",
      "Juliet",
    ];
    const big: MatchEntity[] = Array.from({ length: 2000 }, (_, i) => ({
      id: `x:${i}`,
      name: `${names[i % 10]}${["land", "ia", "stan", "ville", "ica"][i % 5]} ${["North", "South", "Upper", "Lower", ""][(i >> 3) % 5]} ${i}`,
      aliases: [{ text: `Old ${names[i % 10]} ${i}`, kind: "former" }],
    }));
    const bigIndex = new NameIndex(big);
    const ctx: MatchContext = {
      mode: "type_all",
      remaining: new Set(big.map((e) => e.id)),
      strictness: "lenient",
    };
    bigIndex.match("warmup", ctx, { submitted: true });
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) bigIndex.match("alphaland north 1234", ctx, { submitted: true });
    expect((performance.now() - t0) / 20).toBeLessThan(20);
  });

  it("translation aliases are indexed only for enabled answer languages (quiz-library §5.3)", () => {
    const ents: MatchEntity[] = [
      {
        id: "c:DEU",
        name: "Germany",
        aliases: [
          { text: "Alemania", kind: "translation", lang: "es" },
          { text: "Allemagne", kind: "translation", lang: "fr" },
        ],
      },
    ];
    const ctx: MatchContext = { mode: "type_all", remaining: new Set(["c:DEU"]) };
    expect(new NameIndex(ents).match("alemania", ctx, { submitted: true }).kind).toBe(
      "not-recognized",
    );
    const es = new NameIndex(ents, [], { languages: ["es"] });
    expect(es.match("alemania", ctx, { submitted: true })).toMatchObject({
      kind: "accept",
      entityId: "c:DEU",
    });
    expect(es.match("allemagne", ctx, { submitted: true }).kind).toBe("not-recognized");
  });

  it("undeclared alias collisions are reported for the content validator and resolved by what remains", () => {
    const dup = new NameIndex([
      { id: "a", name: "Victoria", aliases: [] },
      { id: "b", name: "Victoria", aliases: [] },
    ]);
    expect(dup.collisions).toEqual([{ key: "victoria", entityIds: ["a", "b"] }]);
    const both: MatchContext = { mode: "type_all", remaining: new Set(["a", "b"]) };
    expect(dup.match("victoria", both, { submitted: true }).kind).toBe("ambiguous");
    expect(
      dup.match(
        "victoria",
        { mode: "type_all", remaining: new Set(["b"]), named: new Set(["a"]) },
        { submitted: true },
      ),
    ).toMatchObject({ kind: "accept", entityId: "b" });
    expect(index.collisions).toEqual([]);
  });
});
