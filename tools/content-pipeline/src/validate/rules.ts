import { normTokens, norm } from "@meridian/name-matcher";
import { adjacencyEdge, licenseProblems, type Entity, type Fact } from "@meridian/schemas";
import { CONTINENT_CODES } from "../ne.ts";
import type { ContentSet, Issue } from "./types.ts";

const ID_RE = /^[a-z]+:[A-Za-z0-9._-]+$/;
const DAY_MS = 86_400_000;
const days = (a: string, b: string): number =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);

/** ID_FORMAT and ID_REUSED. */
export function idRules(c: ContentSet): Issue[] {
  const issues: Issue[] = [];
  const ids = [...c.entities.map((e) => e.id), ...(c.facts ?? []).map((f) => f.id)];
  for (const id of ids) {
    if (!ID_RE.test(id))
      issues.push({
        code: "ID_FORMAT",
        level: "error",
        ref: id,
        message: `"${id}" does not match ^[a-z]+:[A-Za-z0-9._-]+$`,
      });
    if (c.retiredIds?.has(id))
      issues.push({
        code: "ID_REUSED",
        level: "error",
        ref: id,
        message: `${id} was retired in an earlier release and may not be reassigned`,
      });
  }
  return issues;
}

/** Naming problems are warnings while a pack is still a draft (T1.1 reviews names and aliases). */
const naming = (c: ContentSet): "error" | "warn" => (c.draft ? "warn" : "error");

export function nameRules(c: ContentSet): Issue[] {
  const issues: Issue[] = [];
  for (const e of c.entities) {
    if (!e.names.canonical.trim() || norm(e.names.canonical) === "")
      issues.push({
        code: "NAME_MISSING",
        level: "error",
        ref: e.id,
        message: `${e.id} has no usable canonical name`,
      });
  }
  return issues;
}

/** Entities that can be typed as an answer to the same question share an answer universe. */
const universeOf = (e: Entity): string =>
  e.type === "country" || e.type === "territory" ? "country" : e.type;

/** ALIAS_COLLISION (DATA_AND_CONTENT §5.2 rule 1). */
export function aliasRules(c: ContentSet): Issue[] {
  const byKey = new Map<string, Set<string>>();
  for (const e of c.entities) {
    const texts = [
      e.names.canonical,
      ...e.names.aliases.filter((a) => a.kind !== "translation").map((a) => a.text),
    ];
    for (const t of texts) {
      const k = `${universeOf(e)}|${norm(t)}`;
      if (norm(t) === "") continue;
      byKey.set(k, (byKey.get(k) ?? new Set()).add(e.id));
    }
  }
  const groups = new Map<string, Set<string>>();
  for (const g of c.ambiguity ?? []) groups.set(norm(g.alias), new Set(g.members));
  const issues: Issue[] = [];
  for (const [k, ids] of byKey) {
    if (ids.size < 2) continue;
    const key = k.slice(k.indexOf("|") + 1);
    const group = groups.get(key);
    if (group && [...ids].every((id) => group.has(id))) continue;
    issues.push({
      code: "ALIAS_COLLISION",
      level: naming(c),
      ref: key,
      message: `"${key}" is an alias of ${[...ids].sort().join(", ")} and is not covered by an ambiguity group${c.draft ? " (draft pack)" : ""}`,
    });
  }
  return issues.sort((a, b) => (a.ref ?? "").localeCompare(b.ref ?? ""));
}

/** Ambiguity groups must be real: each member exists and actually carries the alias. Disputes must point at real entities. */
export function disputeRules(c: ContentSet): Issue[] {
  const issues: Issue[] = [];
  const byId = new Map(c.entities.map((e) => [e.id, e]));
  for (const g of c.ambiguity ?? []) {
    const key = norm(g.alias);
    for (const id of g.members) {
      const e = byId.get(id);
      const carries =
        e &&
        [e.names.canonical, ...e.names.aliases.map((a) => a.text)].some((t) => norm(t) === key);
      if (!carries)
        issues.push({
          code: "ALIAS_COLLISION",
          level: "error",
          ref: g.group,
          message: `ambiguity group "${g.group}" lists ${id}, which ${e ? `has no alias "${g.alias}"` : "does not exist"}`,
        });
    }
  }
  const seen = new Set<string>();
  for (const d of c.disputes ?? []) {
    if (seen.has(d.id))
      issues.push({
        code: "DISPUTE_INVALID",
        level: "error",
        ref: d.id,
        message: `${d.id} is listed twice`,
      });
    seen.add(d.id);
    for (const id of d.affects)
      if (!byId.has(id))
        issues.push({
          code: "DISPUTE_INVALID",
          level: "error",
          ref: d.id,
          message: `${d.id} affects ${id}, which is not an entity`,
        });
    for (const party of [...d.administered_by, ...d.claimants])
      if (party.startsWith("country:") && !byId.has(party))
        issues.push({
          code: "DISPUTE_INVALID",
          level: "error",
          ref: d.id,
          message: `${d.id} names ${party}, which is not an entity`,
        });
  }
  return issues;
}

/** FLAG_MISSING: every playable country has a flag in the pack, and its confusables are other real entities. */
export function flagRules(c: ContentSet): Issue[] {
  if (!c.flagIds) return [];
  const ids = new Set(c.entities.map((e) => e.id));
  const issues: Issue[] = [];
  for (const e of c.entities) {
    if (!e.sets?.includes("sovereign-197")) continue;
    if (!e.flag || !c.flagIds.has(e.id))
      issues.push({
        code: "FLAG_MISSING",
        level: "error",
        ref: e.id,
        message: `${e.id} has no flag in the flags pack`,
      });
    for (const k of e.flag?.confusables ?? [])
      if (k === e.id || !ids.has(k))
        issues.push({
          code: "FLAG_MISSING",
          level: "error",
          ref: e.id,
          message: `${e.id} lists ${k} as a confusable flag, which is ${k === e.id ? "itself" : "not an entity"}`,
        });
  }
  return issues;
}

/** SET_COUNT: sovereign-197 has exactly 197 members and un-193 exactly 193. */
export function setRules(c: ContentSet): Issue[] {
  if (!c.fullSets) return [];
  const issues: Issue[] = [];
  for (const [set, want] of [
    ["sovereign-197", 197],
    ["un-193", 193],
  ] as const) {
    const n = c.entities.filter((e) => e.sets?.includes(set)).length;
    if (n !== want)
      issues.push({
        code: "SET_COUNT",
        level: "error",
        ref: set,
        message: `${set} has ${n} members, expected ${want}`,
      });
  }
  return issues;
}

/** ADJ_ASYMMETRIC: each border is stored once (a < b), between real entities, without conflicting duplicates. */
export function adjacencyRules(c: ContentSet): Issue[] {
  if (!c.adjacency) return [];
  const known = new Set(c.entities.map((e) => e.id));
  const seen = new Map<string, string>();
  const issues: Issue[] = [];
  for (const edge of c.adjacency) {
    const ref = `${edge.a}~${edge.b}`;
    const parsed = adjacencyEdge.safeParse(edge);
    if (!parsed.success) {
      issues.push({
        code: "ADJ_ASYMMETRIC",
        level: "error",
        ref,
        message: `${ref}: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
      });
      continue;
    }
    for (const id of [edge.a, edge.b])
      if (!known.has(id))
        issues.push({
          code: "ADJ_ASYMMETRIC",
          level: "error",
          ref,
          message: `${ref}: ${id} is not an entity`,
        });
    const key = `${edge.a}|${edge.b}|${edge.crossing ? "x" : "b"}`;
    const reverse = `${edge.b}|${edge.a}|${edge.crossing ? "x" : "b"}`;
    if (seen.has(reverse))
      issues.push({
        code: "ADJ_ASYMMETRIC",
        level: "error",
        ref,
        message: `${ref} is listed in both directions`,
      });
    if (seen.has(key))
      issues.push({
        code: "ADJ_ASYMMETRIC",
        level: "error",
        ref,
        message: `${ref} is listed twice`,
      });
    seen.set(key, ref);
  }
  return issues;
}

/** Entity-type rank used by FACT_NAMES_TARGET: facts at one precision may not name entities at the same rank. */
const PRECISION_TYPES: Record<Fact["precision"], readonly string[]> = {
  exact: ["place", "city", "feature"],
  city: ["city", "place"],
  region: ["subdivision", "region"],
  country: ["country", "territory"],
  broad: ["feature", "continent"],
};

/**
 * FACT_NAMES_TARGET: the text must not give away the answer. It may not contain the answer label, any alias of
 * the target entity, or the alias of any listed entity that sits at the same precision as the answer.
 * Naming a coarser container is fine ("This Japanese city…", fact-pin §4.3).
 */
export function factNameRules(c: ContentSet): Issue[] {
  if (!c.facts) return [];
  const byId = new Map(c.entities.map((e) => [e.id, e] as const));
  const issues: Issue[] = [];
  for (const f of c.facts) {
    // Generated "Pin X" facts name their target by design (fact-pin §4.2).
    if (f.generated) continue;
    const forbidden = new Map<string, string>();
    const add = (text: string, why: string) => {
      const t = normTokens(text);
      if (t.length > 0) forbidden.set(t.join(" "), why);
    };
    add(f.answer_label, "the answer label");
    const ids = new Set<string>(f.entities);
    if (f.target.type === "entity") ids.add(f.target.id);
    for (const id of ids) {
      const e = byId.get(id);
      if (!e) continue;
      const isTarget = f.target.type === "entity" && f.target.id === id;
      if (!isTarget && !PRECISION_TYPES[f.precision].includes(e.type)) continue;
      for (const t of [
        e.names.canonical,
        ...e.names.aliases.filter((a) => a.kind !== "code").map((a) => a.text),
      ])
        add(t, `${isTarget ? "the target" : "an entity at the same precision"} (${e.id})`);
    }
    const text = ` ${normTokens(f.text).join(" ")} `;
    for (const [phrase, why] of forbidden) {
      if (text.includes(` ${phrase} `))
        issues.push({
          code: "FACT_NAMES_TARGET",
          level: "error",
          ref: f.id,
          message: `${f.id}: the text contains "${phrase}", which is ${why}`,
        });
    }
  }
  return issues;
}

/** FACT_NO_SOURCE and FACT_REVIEW_OVERDUE. */
export function factRules(c: ContentSet): Issue[] {
  const issues: Issue[] = [];
  for (const f of c.facts ?? []) {
    if (
      f.status === "published" &&
      !f.sources.some((s) => s.license.trim() !== "" && s.url.trim() !== "")
    ) {
      issues.push({
        code: "FACT_NO_SOURCE",
        level: "error",
        ref: f.id,
        message: `${f.id} is published without a source that has a license`,
      });
    }
    if (f.status === "published" && f.review_due) {
      const late = days(f.review_due, c.today);
      if (late > 30)
        issues.push({
          code: "FACT_REVIEW_OVERDUE",
          level: "error",
          ref: f.id,
          message: `${f.id}: review was due ${f.review_due}, ${late} days ago, so the fact is excluded from generation`,
        });
      else if (late > 0)
        issues.push({
          code: "FACT_REVIEW_OVERDUE",
          level: "warn",
          ref: f.id,
          message: `${f.id}: review was due ${f.review_due} (${late} days ago)`,
        });
    }
  }
  return issues;
}

const FACT_CONTINENTS = ["AF", "AS", "EU", "NA", "SA", "OC"] as const;

/** QUOTA (DATA_AND_CONTENT §8.3): Fact Pin continents ≥ 10% each, categories ≥ 50 facts each. */
export function quotaRules(c: ContentSet): Issue[] {
  if (!c.quotas || !c.facts) return [];
  const facts = c.facts.filter((f) => f.status === "published");
  const issues: Issue[] = [];
  if (facts.length === 0)
    return [
      { code: "QUOTA", level: "error", message: "there are no published facts to meet the quotas" },
    ];
  const byId = new Map(c.entities.map((e) => [e.id, e] as const));
  const continentOf = (f: Fact): string | undefined => {
    for (const id of f.entities) {
      const code = byId
        .get(id)
        ?.parent_ids.find((p) => p.startsWith("continent:"))
        ?.slice("continent:".length);
      if (code) return code;
    }
    return undefined;
  };
  const counts = new Map<string, number>();
  for (const f of facts) {
    const k = continentOf(f);
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  for (const code of FACT_CONTINENTS) {
    const share = (counts.get(code) ?? 0) / facts.length;
    if (share < 0.1)
      issues.push({
        code: "QUOTA",
        level: "error",
        ref: code,
        message: `continent ${code} has ${(share * 100).toFixed(1)}% of facts, the minimum is 10%`,
      });
  }
  const cats = new Map<string, number>();
  for (const f of facts) cats.set(f.category, (cats.get(f.category) ?? 0) + 1);
  for (const [cat, n] of [...cats].sort())
    if (n < 50)
      issues.push({
        code: "QUOTA",
        level: "error",
        ref: cat,
        message: `category "${cat}" has ${n} facts, the minimum is 50`,
      });
  return issues;
}

/** Repeat windows in days (silhouette §11, fact-pin §11; Fact Pin is 14 days until the bank grows). */
export const DAILY_WINDOWS: Record<string, number> = { silhouette: 150, "fact-pin": 14 };

/** DAILY_REPEAT: no target twice within the game's window, no two consecutive same-continent silhouettes, five distinct categories per Fact Pin day. */
export function dailyRules(c: ContentSet): Issue[] {
  const issues: Issue[] = [];
  const byId = new Map(c.entities.map((e) => [e.id, e] as const));
  const factById = new Map((c.facts ?? []).map((f) => [f.id, f] as const));
  for (const s of c.daily ?? []) {
    const window = DAILY_WINDOWS[s.game];
    const dates = Object.keys(s.days).sort();
    if (window !== undefined) {
      const last = new Map<string, string>();
      for (const d of dates) {
        for (const id of s.days[d] ?? []) {
          const prev = last.get(id);
          if (prev !== undefined && days(prev, d) < window)
            issues.push({
              code: "DAILY_REPEAT",
              level: "error",
              ref: id,
              message: `${s.game}: ${id} appears on ${prev} and ${d}, within the ${window}-day window`,
            });
          last.set(id, d);
        }
      }
    }
    if (s.game === "silhouette") {
      const continent = (id: string): string | undefined =>
        byId.get(id)?.parent_ids.find((p) => p.startsWith("continent:"));
      for (let i = 1; i < dates.length; i++) {
        const a = s.days[dates[i - 1] as string]?.[0];
        const b = s.days[dates[i] as string]?.[0];
        const ca = a ? continent(a) : undefined;
        if (a && b && ca && ca === continent(b))
          issues.push({
            code: "DAILY_REPEAT",
            level: "error",
            ref: dates[i] as string,
            message: `silhouette: ${dates[i - 1]} and ${dates[i]} are both ${ca}`,
          });
      }
    }
    if (s.game === "silhouette") {
      const shapeOf = (id: string): number | undefined => byId.get(id)?.difficulty?.shape;
      const small = (id: string): boolean => (byId.get(id)?.area_km2?.value ?? Infinity) < 5000;
      const poolShapes = c.entities
        .filter((e) => e.sets?.includes("sovereign-197"))
        .map((e) => e.difficulty?.shape)
        .filter((x): x is number => x !== undefined);
      const poolMean = poolShapes.length
        ? poolShapes.reduce((a, b) => a + b, 0) / poolShapes.length
        : undefined;
      for (let i = 0; i + 6 < dates.length; i++) {
        const win = dates.slice(i, i + 7).map((d) => s.days[d]?.[0] as string);
        if (win.filter(small).length > 1)
          issues.push({
            code: "DAILY_REPEAT",
            level: "error",
            ref: dates[i] as string,
            message: `silhouette: more than one entity under 5,000 km² in the 7 days from ${dates[i]}`,
          });
        const shapes = win.map(shapeOf);
        if (poolMean !== undefined && shapes.every((x): x is number => x !== undefined)) {
          const m = shapes.reduce((a, b) => a + b, 0) / 7;
          if (Math.abs(m - poolMean) > 0.1 + 1e-9)
            issues.push({
              code: "DAILY_REPEAT",
              level: "error",
              ref: dates[i] as string,
              message: `silhouette: the 7-day mean difficulty from ${dates[i]} is ${m.toFixed(3)}, more than 0.1 from the pool mean ${poolMean.toFixed(3)}`,
            });
        }
      }
    }
    if (s.game === "fact-pin") {
      for (const d of dates) {
        const cats = (s.days[d] ?? [])
          .map((id) => factById.get(id)?.category)
          .filter((x): x is string => x !== undefined);
        if (new Set(cats).size !== cats.length)
          issues.push({
            code: "DAILY_REPEAT",
            level: "error",
            ref: d,
            message: `fact-pin ${d}: the five facts must come from five different categories`,
          });
      }
    }
  }
  return issues;
}

/** LICENSE_UNVERIFIED: only for release builds. */
export function licenseRules(c: ContentSet): Issue[] {
  if (!c.release || !c.registry) return [];
  return licenseProblems(c.registry, c.usedSources ?? []).map((m): Issue => ({
    code: "LICENSE_UNVERIFIED",
    level: "error",
    message: m,
    ref: m.split(":")[0] as string,
  }));
}

export { CONTINENT_CODES };
