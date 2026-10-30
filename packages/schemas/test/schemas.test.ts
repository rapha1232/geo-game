import { describe, expect, it } from "vitest";
import {
  adjacencyEdge,
  ambiguityGroup,
  contentVersion,
  createChallengeRequest,
  createReportRequest,
  dailySchedule,
  entity,
  entityId,
  fact,
  gameResult,
  healthResponse,
  isoDate,
  manifest,
  problem,
  seed,
  topology,
  ulid,
  ERROR_CODES,
  ERROR_STATUS,
} from "../src/index";

const ok = (r: { success: boolean }) => expect(r.success).toBe(true);
const bad = (r: { success: boolean }) => expect(r.success).toBe(false);
const messages = (r: { success: boolean; error?: { issues: { message: string }[] } }) =>
  (r.error?.issues ?? []).map((i) => i.message).join(" | ");

describe("identifiers", () => {
  it("accepts every ID shape in DATA_MODEL and rejects look-alikes", () => {
    for (const id of [
      "country:FRA",
      "country:XKX",
      "territory:GRL",
      "continent:AF",
      "region:western-africa",
      "subdivision:US-CA",
      "subdivision:GB-ENG",
      "city:gn-2988507",
      "feature:nile",
      "place:south-pole",
    ])
      ok(entityId.safeParse(id));
    for (const id of [
      "country:fra",
      "country:FR",
      "continent:XX",
      "region:Western Africa",
      "city:2988507",
      "FRA",
      "fact:0142",
      "",
    ])
      bad(entityId.safeParse(id));
  });

  it("seed is 10 Crockford characters (no I, L, O, U)", () => {
    ok(seed.safeParse("K7Q2M9XD1A"));
    for (const s of ["K7Q2M9XD1", "K7Q2M9XD1AA", "K7Q2M9XD1U", "k7q2m9xd1a", "K7Q2M9XDIL"])
      bad(seed.safeParse(s));
  });

  it("ULID, content version and ISO date", () => {
    ok(ulid.safeParse("01JC8Z5V6R2Q8T3X9K4M7N1P0A"));
    bad(ulid.safeParse("01JC8Z5V6R2Q8T3X9K4M7N1P0")); // 25 characters
    ok(contentVersion.safeParse("2026.11.0"));
    for (const v of ["2026.13.0", "2026.1.0", "26.11.0", "2026.11"])
      bad(contentVersion.safeParse(v));
    ok(isoDate.safeParse("2028-02-29"));
    for (const d of ["2027-02-29", "2026-13-01", "2026-1-1", "not a date"])
      bad(isoDate.safeParse(d));
  });
});

const france = {
  id: "country:FRA",
  type: "country",
  names: {
    canonical: "France",
    aliases: [
      { text: "French Republic", kind: "official" },
      { text: "FRA", kind: "code" },
    ],
  },
  external_ids: { iso2: "FR", iso3: "FRA", iso_numeric: 250, wikidata: "Q142" },
  label_point: [46.6, 2.5],
  ref_point: [46.6, 2.5],
  bbox: [-5.1, 41.3, 9.6, 51.1],
  parent_ids: ["region:western-europe", "continent:EU"],
  sets: ["sovereign-197", "un-193"],
  difficulty: { recall: 0.05, locate: 0.05, flag: 0.05, capital: 0.05, shape: 0.1 },
  source_ids: ["wd", "ne"],
  capitals: [{ name: "Paris", role: "official" }],
};

describe("entity", () => {
  it("accepts a complete country", () => ok(entity.safeParse(france)));

  it("rejects an id prefix that disagrees with the type", () => {
    const r = entity.safeParse({ ...france, type: "territory" });
    bad(r);
    expect(messages(r)).toContain("does not match type");
  });

  it("requires ref_point and sets for countries and territories", () => {
    const { ref_point: _r, ...noRef } = france;
    expect(messages(entity.safeParse(noRef))).toContain("ref_point is required");
    const { sets: _s, ...noSets } = france;
    expect(messages(entity.safeParse(noSets))).toContain("sets is required");
  });

  it("a territory needs sovereign_of or not_in_set_reason", () => {
    const gl = {
      ...france,
      id: "territory:GRL",
      type: "territory",
      names: { canonical: "Greenland", aliases: [] },
      sets: ["territories"],
    };
    expect(messages(entity.safeParse(gl))).toContain("sovereign_of");
    ok(entity.safeParse({ ...gl, sovereign_of: "country:DNK" }));
    ok(
      entity.safeParse({
        ...gl,
        not_in_set_reason: "Greenland is an autonomous territory of Denmark.",
      }),
    );
  });

  it("rejects coordinates out of range, a canonical alias, empty sources and reversed validity", () => {
    bad(entity.safeParse({ ...france, label_point: [91, 0] }));
    bad(entity.safeParse({ ...france, label_point: [0, 181] }));
    bad(
      entity.safeParse({
        ...france,
        names: { canonical: "France", aliases: [{ text: "France", kind: "canonical" }] },
      }),
    );
    bad(entity.safeParse({ ...france, source_ids: [] }));
    bad(entity.safeParse({ ...france, valid_from: "1990-01-01", valid_to: "1980-01-01" }));
  });

  it("alias kinds cover DATA_AND_CONTENT §5.1", () => {
    for (const kind of [
      "canonical",
      "common",
      "official",
      "ascii",
      "former",
      "endonym",
      "translation",
      "code",
      "misspelling",
    ]) {
      ok(
        entity.safeParse({
          ...france,
          names: {
            canonical: "France",
            aliases: kind === "canonical" ? [] : [{ text: "x", kind, lang: "fr" }],
          },
        }),
      );
    }
    bad(
      entity.safeParse({
        ...france,
        names: { canonical: "France", aliases: [{ text: "x", kind: "nickname" }] },
      }),
    );
  });
});

describe("ambiguity groups and adjacency", () => {
  it("accepts the Congo group and needs at least two members", () => {
    const congo = {
      group: "congo",
      alias: "Congo",
      universe: "country",
      members: ["country:COG", "country:COD"],
      message: 'Which Congo? Try "Republic of the Congo" or "DR Congo".',
    };
    ok(ambiguityGroup.safeParse(congo));
    bad(ambiguityGroup.safeParse({ ...congo, members: ["country:COG"] }));
  });

  it("adjacency edges: canonical order, no self-edges (spec examples)", () => {
    ok(
      adjacencyEdge.safeParse({
        a: "country:ESP",
        b: "country:FRA",
        length_km: 656,
        disputed: false,
      }),
    );
    ok(
      adjacencyEdge.safeParse({
        a: "country:BRA",
        b: "country:FRA",
        length_km: 730,
        via: "French Guiana",
        disputed: false,
      }),
    );
    ok(
      adjacencyEdge.safeParse({
        a: "country:FRA",
        b: "country:GBR",
        type: "tunnel",
        name: "Channel Tunnel",
        crossing: true,
      }),
    );
    expect(messages(adjacencyEdge.safeParse({ a: "country:FRA", b: "country:ESP" }))).toContain(
      "canonical order",
    );
    expect(messages(adjacencyEdge.safeParse({ a: "country:FRA", b: "country:FRA" }))).toContain(
      "self-edge",
    );
  });
});

describe("manifest", () => {
  const sha = "a".repeat(64);
  const m = {
    current: "2026.11.0",
    versions: {
      "2026.11.0": {
        released_at: "2026-11-02T10:00:00Z",
        packs: {
          "core.countries": {
            url: "content/2026.11.0/core.countries.3f9a1c.json",
            bytes: 61234,
            sha256: sha,
          },
          "geo.world.110m": {
            url: "content/2026.11.0/geo.world.110m.a81b22.json",
            bytes: 88001,
            sha256: sha,
          },
        },
        licenses: ["ne:PD", "wd:CC0", "fi:MIT", "wb:CC-BY-4.0"],
        notes_url: "content/2026.11.0/RELEASE_NOTES.md",
      },
    },
  };
  it("accepts the spec example shape", () => ok(manifest.safeParse(m)));
  it("rejects a current version that is not listed, a bad hash and a bad pack name", () => {
    expect(messages(manifest.safeParse({ ...m, current: "2026.12.0" }))).toContain("not listed");
    const v = m.versions["2026.11.0"];
    bad(
      manifest.safeParse({
        ...m,
        versions: {
          "2026.11.0": {
            ...v,
            packs: { "core.countries": { ...v.packs["core.countries"], sha256: "xyz" } },
          },
        },
      }),
    );
    bad(
      manifest.safeParse({
        ...m,
        versions: { "2026.11.0": { ...v, packs: { Countries: v.packs["core.countries"] } } },
      }),
    );
  });
});

describe("topology", () => {
  it("validates the envelope and the per-geometry id", () => {
    const t = {
      type: "Topology",
      arcs: [
        [
          [0, 0],
          [1, 1],
        ],
      ],
      objects: {
        countries: {
          type: "GeometryCollection",
          geometries: [
            { type: "Polygon", id: "country:FRA", arcs: [[0]], properties: { parts: "main" } },
          ],
        },
      },
    };
    ok(topology.safeParse(t));
    bad(
      topology.safeParse({
        ...t,
        objects: {
          countries: {
            type: "GeometryCollection",
            geometries: [{ type: "Polygon", id: "FRA", arcs: [[0]] }],
          },
        },
      }),
    );
    bad(topology.safeParse({ ...t, type: "FeatureCollection" }));
  });
});

const pointFact = {
  id: "fact:0142",
  text: "Roald Amundsen's expedition became the first to reach this point, in December 1911, after a long and difficult sledge journey across the ice.",
  answer_label: "South Pole",
  category: "history",
  era: "modern",
  precision: "exact",
  target: { type: "point", coords: [-90.0, 0.0] },
  tolerance_km: 25,
  reveal: "Amundsen's Norwegian party reached the geographic South Pole on 14 December 1911.",
  sources: [
    {
      title: "Roald Amundsen (Q47538)",
      url: "https://www.wikidata.org/wiki/Q47538",
      license: "CC0",
    },
  ],
  difficulty: 0.35,
  entities: ["place:south-pole"],
  status: "published",
  reviewed_at: "2026-10-01",
  review_due: null,
};

describe("fact", () => {
  it("accepts the fact-pin §4.1 shape", () => ok(fact.safeParse(pointFact)));

  it("FACT_NO_SOURCE: a published fact needs a source and a review date", () => {
    expect(messages(fact.safeParse({ ...pointFact, sources: [] }))).toContain("FACT_NO_SOURCE");
    expect(messages(fact.safeParse({ ...pointFact, reviewed_at: null }))).toContain("reviewed_at");
    ok(fact.safeParse({ ...pointFact, sources: [], reviewed_at: null, status: "draft" }));
  });

  it("published text is 12–35 words (fact-pin §4.3)", () => {
    expect(messages(fact.safeParse({ ...pointFact, text: "Too short." }))).toContain("12–35");
    expect(
      messages(fact.safeParse({ ...pointFact, text: Array(40).fill("word").join(" ") })),
    ).toContain("12–35");
  });

  it("targets: point needs tolerance, exact needs a point, entity and polygon forms", () => {
    const { tolerance_km: _t, ...noTol } = pointFact;
    expect(messages(fact.safeParse(noTol))).toContain("tolerance_km");
    expect(
      messages(fact.safeParse({ ...pointFact, target: { type: "entity", id: "country:PER" } })),
    ).toContain("exact precision needs a point");
    ok(
      fact.safeParse({
        ...pointFact,
        precision: "country",
        target: { type: "entity", id: "country:PER" },
      }),
    );
    ok(
      fact.safeParse({
        ...pointFact,
        precision: "broad",
        target: { type: "polygon", ref: "feature:atacama" },
      }),
    );
    bad(fact.safeParse({ ...pointFact, target: { type: "point", coords: [-91, 0] } }));
  });

  it("rejects a non-URL source and difficulty outside 0..1", () => {
    bad(fact.safeParse({ ...pointFact, sources: [{ title: "x", url: "nope", license: "CC0" }] }));
    bad(fact.safeParse({ ...pointFact, difficulty: 1.2 }));
  });
});

describe("daily schedule", () => {
  const sil = {
    game: "silhouette",
    from: "2026-11-01",
    to: "2026-11-03",
    days: {
      "2026-11-01": ["country:MNG"],
      "2026-11-02": ["country:URY"],
      "2026-11-03": ["country:FRA"],
    },
  };
  it("accepts the spec shape", () => ok(dailySchedule.safeParse(sil)));
  it("needs the right number of items per game", () => {
    expect(
      messages(
        dailySchedule.safeParse({
          ...sil,
          days: { ...sil.days, "2026-11-02": ["country:URY", "country:FRA"] },
        }),
      ),
    ).toContain("needs 1 item");
    const fp = {
      game: "fact-pin",
      from: "2026-11-01",
      to: "2026-11-01",
      days: { "2026-11-01": ["fact:0001", "fact:0002", "fact:0003", "fact:0004", "fact:0005"] },
    };
    ok(dailySchedule.safeParse(fp));
    bad(dailySchedule.safeParse({ ...fp, days: { "2026-11-01": ["fact:0001"] } }));
    ok(
      dailySchedule.safeParse({
        game: "border-run",
        from: "2026-11-01",
        to: "2026-11-01",
        days: { "2026-11-01": ["country:FRA", "country:MNG"] },
      }),
    );
  });
  it("has no gaps and nothing outside the range", () => {
    const { "2026-11-02": _d, ...gap } = sil.days;
    expect(messages(dailySchedule.safeParse({ ...sil, days: gap }))).toContain("expected 3 days");
    expect(
      messages(
        dailySchedule.safeParse({ ...sil, days: { ...sil.days, "2026-11-09": ["country:FRA"] } }),
      ),
    ).toContain("outside");
    expect(messages(dailySchedule.safeParse({ ...sil, to: "2026-10-01" }))).toContain(
      "before from",
    );
  });
});

const result = {
  id: "01JC8Z5V6R2Q8T3X9K4M7N1P0A",
  game_id: "silhouette",
  mode: "unlimited",
  config: { pool: "sovereign-197", difficulty: "normal", followUps: ["capital", "flag"] },
  config_hash: "9c1e2a7b",
  seed: "K7Q2M9XD1A",
  content_version: "2026.11.0",
  score: 4,
  max_score: 8,
  outcome: "solved",
  items: [
    {
      item_id: "target",
      entity_id: "country:FRA",
      status: "correct",
      attempts: 3,
      hints: 1,
      points: 3,
      ms: 41210,
    },
    { item_id: "followup:capital", status: "correct", points: 1 },
    { item_id: "followup:flag", status: "wrong", points: 0 },
  ],
  meta: {
    guesses: [{ entity_id: "country:BRA", km: 8651, sector: "NE", proximity: 56, border: true }],
  },
  flags: { resumed: false, pauseCount: 0, assisted: false, guardRelaxed: false, attempt: 1 },
  started_at: "2026-11-05T08:01:02Z",
  ended_at: "2026-11-05T08:01:52Z",
  active_ms: 49800,
};

describe("game result", () => {
  it("accepts the DATA_MODEL §2.9 example", () => ok(gameResult.safeParse(result)));

  it("plausibility rules from API_CONTRACTS §4.5", () => {
    expect(messages(gameResult.safeParse({ ...result, score: 9 }))).toContain("exceeds max_score");
    expect(
      messages(gameResult.safeParse({ ...result, ended_at: "2026-11-05T08:00:00Z" })),
    ).toContain("before started_at");
    expect(messages(gameResult.safeParse({ ...result, active_ms: 50_000 + 61_000 }))).toContain(
      "active_ms",
    );
    ok(gameResult.safeParse({ ...result, active_ms: 50_000 + 60_000 }));
    expect(messages(gameResult.safeParse({ ...result, mode: "daily" }))).toContain("daily_date");
    ok(gameResult.safeParse({ ...result, mode: "daily", daily_date: "2026-11-05" }));
  });

  it("limits items to 500 and validates ids and enums", () => {
    bad(
      gameResult.safeParse({
        ...result,
        items: Array.from({ length: 501 }, (_, i) => ({ item_id: `i${i}`, status: "correct" })),
      }),
    );
    bad(gameResult.safeParse({ ...result, game_id: "tetris" }));
    bad(gameResult.safeParse({ ...result, outcome: "won" }));
    bad(gameResult.safeParse({ ...result, seed: "short" }));
    bad(gameResult.safeParse({ ...result, flags: { ...result.flags, attempt: 0 } }));
  });
});

describe("API payloads", () => {
  it("health response", () => {
    ok(
      healthResponse.safeParse({
        status: "ok",
        db: "ok",
        content_version: "2026.11.0",
        app_version: "abc1234",
      }),
    );
    bad(
      healthResponse.safeParse({
        status: "ok",
        db: "maybe",
        content_version: "2026.11.0",
        app_version: "x",
      }),
    );
  });

  it("problem+json and the status table agree", () => {
    ok(
      problem.safeParse({
        type: "https://meridian-quiz.vercel.app/problems/validation",
        title: "Invalid request",
        status: 422,
        code: "VALIDATION_FAILED",
        detail: "message must be between 10 and 1000 characters",
        errors: [{ path: "message", message: "Too short" }],
        request_id: "req_01JC9",
      }),
    );
    for (const code of ERROR_CODES) expect(ERROR_STATUS[code]).toBeGreaterThanOrEqual(400);
    expect(ERROR_STATUS.RATE_LIMITED).toBe(429);
    expect(ERROR_STATUS.GONE).toBe(410);
    expect(ERROR_CODES).toHaveLength(11);
  });

  it("challenge request: payload at most 2 KB", () => {
    const base = {
      game_id: "silhouette",
      payload: "eJyrVkpUslJKVKoFAA",
      content_version: "2026.11.0",
    };
    ok(createChallengeRequest.safeParse(base));
    bad(createChallengeRequest.safeParse({ ...base, payload: "x".repeat(2049) }));
    ok(createChallengeRequest.safeParse({ ...base, payload: "x".repeat(2048) }));
    bad(createChallengeRequest.safeParse({ ...base, game_id: "nope" }));
  });

  it("report request: message 10–1,000 characters, context ≤ 4 KB, optional valid email", () => {
    const base = {
      category: "answer_rejected",
      message: "Typing 'Cabo Verde' should be accepted for Cape Verde.",
      target_ref: "country:CPV",
      context: { game_id: "quiz", input: "cabo verde" },
      reporter_email: "optional@example.com",
    };
    ok(createReportRequest.safeParse(base));
    bad(createReportRequest.safeParse({ ...base, message: "too short" }));
    bad(createReportRequest.safeParse({ ...base, message: "x".repeat(1001) }));
    bad(createReportRequest.safeParse({ ...base, context: { blob: "x".repeat(5000) } }));
    bad(createReportRequest.safeParse({ ...base, reporter_email: "not-an-email" }));
    bad(createReportRequest.safeParse({ ...base, category: "rant" }));
    const { reporter_email: _e, ...noEmail } = base;
    ok(createReportRequest.safeParse(noEmail));
  });
});
