import { buildPacks, type BuildInput, type BuildOutput } from "../build.ts";
import { capitalRules, decodePack, geometryRules, refPointRules } from "./geometry.ts";
import {
  adjacencyRules,
  aliasRules,
  dailyRules,
  disputeRules,
  factNameRules,
  factRules,
  idRules,
  licenseRules,
  nameRules,
  quotaRules,
  setRules,
} from "./rules.ts";
import type { ContentSet, GeometryByScale, Issue } from "./types.ts";

export * from "./types.ts";
export { decodePack, polygonProblems, ringSelfIntersects } from "./geometry.ts";
export * from "./rules.ts";

const order = (i: Issue): string =>
  `${i.level === "error" ? 0 : 1}|${i.code}|${i.ref ?? ""}|${i.message}`;

/** Runs every rule and returns the issues, errors first. */
export function validate(c: ContentSet): Issue[] {
  const all = [
    ...idRules(c),
    ...nameRules(c),
    ...aliasRules(c),
    ...disputeRules(c),
    ...setRules(c),
    ...geometryRules(c),
    ...refPointRules(c),
    ...capitalRules(c),
    ...adjacencyRules(c),
    ...factRules(c),
    ...factNameRules(c),
    ...quotaRules(c),
    ...dailyRules(c),
    ...licenseRules(c),
  ];
  return all.sort((a, b) => order(a).localeCompare(order(b)));
}

export const errorsOf = (issues: readonly Issue[]): Issue[] =>
  issues.filter((i) => i.level === "error");

/** DETERMINISM: rebuilding yields identical pack hashes. */
export function checkDeterminism(build: () => BuildOutput): Issue[] {
  const a = build();
  const b = build();
  const issues: Issue[] = [];
  a.files.forEach((f, i) => {
    if (f.sha256 !== b.files[i]?.sha256)
      issues.push({
        code: "DETERMINISM",
        level: "error",
        ref: f.name,
        message: `${f.name} differs between two builds (${f.sha256.slice(0, 12)} vs ${b.files[i]?.sha256.slice(0, 12)})`,
      });
  });
  if (a.files.length !== b.files.length)
    issues.push({
      code: "DETERMINISM",
      level: "error",
      message: "two builds produced a different number of packs",
    });
  return issues;
}

/** Turns a build into the snapshot the rules inspect (decodes the geometry packs, as a player's browser would). */
export function contentSetFromBuild(
  input: BuildInput,
  out: BuildOutput,
  extra: Partial<ContentSet> = {},
): ContentSet {
  const json = (name: string): unknown =>
    JSON.parse(new TextDecoder().decode(out.files.find((f) => f.name === name)?.bytes));
  const core = json("core.countries") as { draft: boolean; entities: ContentSet["entities"] };
  const has = (name: string): boolean => out.files.some((f) => f.name === name);
  const ambiguity = has("core.ambiguity")
    ? (json("core.ambiguity") as { groups: ContentSet["ambiguity"] }).groups
    : undefined;
  const disputes = has("core.disputes")
    ? (json("core.disputes") as { disputes: ContentSet["disputes"] }).disputes
    : undefined;
  const daily = out.files
    .filter((f) => f.name.startsWith("daily."))
    .map((f) => json(f.name) as unknown as NonNullable<ContentSet["daily"]>[number]);
  const adjacency = has("core.adjacency")
    ? (json("core.adjacency") as { edges: ContentSet["adjacency"] }).edges
    : undefined;
  const capitals = core.entities.flatMap((e) =>
    (e.capitals ?? []).flatMap((c) =>
      c.point ? [{ entityId: e.id, name: c.name, lat: c.point[0], lon: c.point[1] }] : [],
    ),
  );
  const geometry = {} as GeometryByScale;
  for (const scale of ["110m", "50m", "10m"] as const)
    geometry[scale] = decodePack(json(`geo.world.${scale}`));
  return {
    today: input.releasedAt.slice(0, 10),
    entities: core.entities,
    draft: core.draft,
    ...(ambiguity ? { ambiguity } : {}),
    ...(disputes ? { disputes } : {}),
    ...(adjacency ? { adjacency } : {}),
    ...(daily.length > 0 ? { daily } : {}),
    ...(capitals.length > 0 ? { capitals } : {}),
    geometry,
    registry: input.registry,
    usedSources: input.registry.sources
      .filter((s) => s.used_in.some((u) => out.files.some((f) => f.name === u)))
      .map((s) => s.id),
    ...extra,
  };
}

export { buildPacks };
