import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parse } from "yaml";
import { ambiguityGroup, dispute, sourceRegistry } from "@meridian/schemas";
import { z } from "zod";
import { adjacencyOverrides, silhouetteOverrides } from "./derive.ts";
import { extendSchedule } from "./daily.ts";
import { dailySchedule } from "@meridian/schemas";
import { checkEditorialCoverage, parseEditorial } from "./editorial.ts";
import { buildPacks, type BuildOutput } from "./build.ts";
import {
  checkDeterminism,
  contentSetFromBuild,
  errorsOf,
  validate,
  type KnownCapitalIssue,
  type KnownGeometryIssue,
} from "./validate/index.ts";
import { fetchSources, lockText } from "./fetch.ts";
import { parseLock, verifyAgainstLock, type LockFile } from "./lock.ts";
import type { NeCollection } from "./ne.ts";
import { SOURCES, WIKIDATA_SNAPSHOT } from "./sources.ts";
import { sha256, stableStringify } from "./util.ts";
import { fetchWikidataSnapshot, snapshotBytes, type WdSnapshot } from "./wikidata.ts";

const root = resolve(import.meta.dirname, "../../..");
const path = {
  raw: join(root, "data/raw"),
  lock: join(root, "data/sources.lock.yaml"),
  registry: join(root, "data/sources.registry.yaml"),
  snapshot: join(root, WIKIDATA_SNAPSHOT.file),
  sets: join(root, "content/sets/sovereign-197.yaml"),
  countries: join(root, "content/countries.yaml"),
  ambiguity: join(root, "content/ambiguity.yaml"),
  disputes: join(root, "content/disputes.yaml"),
  silhouettes: join(root, "content/overrides/silhouettes.yaml"),
  dailySilhouette: join(root, "content/daily/silhouette.json"),
  adjacency: join(root, "content/overrides/adjacency.yaml"),
  version: join(root, "content/version.txt"),
  dist: join(root, "dist/content"),
};

const log = (m: string): void => console.log(m);
const flag = (args: string[], name: string): boolean => args.includes(`--${name}`);
const option = (args: string[], name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

async function readLock(): Promise<LockFile> {
  try {
    return parseLock(await readFile(path.lock, "utf8"));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return { entries: [] };
    throw e;
  }
}

async function readSetMembers(): Promise<{ code: string; un: boolean }[]> {
  const doc = parse(await readFile(path.sets, "utf8"), { schema: "core" }) as {
    members: { code: string; un: boolean }[];
  };
  return doc.members;
}

async function cmdFetch(args: string[]): Promise<void> {
  const updateLock = flag(args, "update-lock");
  let lock = await readLock();
  const result = await fetchSources(
    { rawDir: path.raw, lock, updateLock, fetcher: (u, i) => fetch(u, i as RequestInit), log },
    SOURCES,
  );
  lock = result.lock;
  if (flag(args, "wikidata")) {
    const members = await readSetMembers();
    const snap = await fetchWikidataSnapshot(
      members.map((m) => m.code),
      new Date().toISOString().slice(0, 10),
      (u, i) => fetch(u, i as RequestInit),
    );
    await mkdir(dirname(path.snapshot), { recursive: true });
    const text = snapshotBytes(snap);
    await writeFile(path.snapshot, text);
    lock = {
      entries: [
        ...lock.entries.filter((e) => e.id !== WIKIDATA_SNAPSHOT.id),
        {
          id: WIKIDATA_SNAPSHOT.id,
          source: "wd",
          url: snap.endpoint,
          version: `snapshot ${snap.retrieved_on}`,
          sha256: sha256(text),
          bytes: Buffer.byteLength(text),
        },
      ],
    };
    log(`wikidata snapshot: ${snap.countries.length} countries, ${snap.capitals.length} capitals`);
  }
  if (updateLock || result.downloaded.length > 0 || flag(args, "wikidata")) {
    if (updateLock || flag(args, "wikidata")) await writeFile(path.lock, lockText(lock));
  }
  log(`fetch done: ${result.downloaded.length} downloaded, ${result.cached.length} cached`);
}

/** Daily schedules are optional: a build without `content/daily/` simply has no daily packs. */
async function readDaily() {
  try {
    return [dailySchedule.parse(JSON.parse(await readFile(path.dailySilhouette, "utf8")))];
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
}

async function loadInputs(args: string[]) {
  const lock = await readLock();
  const read = async (id: string, file: string): Promise<Uint8Array> => {
    const bytes = new Uint8Array(await readFile(file));
    const check = verifyAgainstLock(lock, id, bytes);
    if (!check.ok) throw new Error(`${id}: ${check.reason}`);
    return bytes;
  };
  const ne = async (id: string, scale: string): Promise<NeCollection> =>
    JSON.parse(
      new TextDecoder().decode(
        await read(id, join(path.raw, `ne/ne_${scale}_admin_0_countries.geojson`)),
      ),
    ) as NeCollection;
  const snapshot = JSON.parse(
    new TextDecoder().decode(await read(WIKIDATA_SNAPSHOT.id, path.snapshot)),
  ) as WdSnapshot;
  const version = option(args, "version") ?? (await readFile(path.version, "utf8")).trim();
  const yaml = async (file: string): Promise<unknown> =>
    parse(await readFile(file, "utf8"), { schema: "core" });
  const members = await readSetMembers();
  const editorial = parseEditorial(await yaml(path.countries));
  checkEditorialCoverage(
    editorial,
    members.map((m) => m.code),
  );
  const list =
    <T extends z.ZodTypeAny>(schema: T, key: string) =>
    async (file: string): Promise<z.infer<T>[]> =>
      z.array(schema).parse(((await yaml(file)) as Record<string, unknown>)[key]);
  return {
    version,
    editorial,
    ambiguity: await list(ambiguityGroup, "groups")(path.ambiguity),
    disputes: await list(dispute, "disputes")(path.disputes),
    daily: await readDaily(),
    derive: {
      silhouettes: silhouetteOverrides.parse(await yaml(path.silhouettes)).overrides,
      adjacency: adjacencyOverrides.parse(await yaml(path.adjacency)),
    },
    releasedAt: option(args, "released-at") ?? new Date().toISOString(),
    members,
    ne: {
      "110m": await ne("ne-110m-countries", "110m"),
      "50m": await ne("ne-50m-countries", "50m"),
      "10m": await ne("ne-10m-countries", "10m"),
    },
    wikidata: snapshot,
    registry: sourceRegistry.parse(
      parse(await readFile(path.registry, "utf8"), { schema: "core" }),
    ),
  };
}

export async function writeBuild(out: BuildOutput, dist: string): Promise<void> {
  const dir = join(dist, out.version);
  await mkdir(dir, { recursive: true });
  for (const f of out.files) await writeFile(join(dir, f.file), f.bytes);
  await writeFile(join(dir, "RELEASE_NOTES.md"), out.releaseNotes);
  await writeFile(join(dist, "manifest.json"), `${JSON.stringify(out.manifest, null, 2)}\n`);
}

async function cmdBuild(args: string[]): Promise<void> {
  const out = buildPacks(await loadInputs(args));
  // Relative paths mean relative to the repository root, whatever directory pnpm runs the script from.
  const dist = resolve(root, option(args, "out") ?? path.dist);
  await writeBuild(out, dist);
  for (const f of out.files)
    log(
      `${f.file.padEnd(34)} ${String(f.bytes.length).padStart(9)} bytes  ${f.sha256.slice(0, 12)}`,
    );
  log(`built ${out.version} into ${dist}`);
}

async function cmdValidate(args: string[]): Promise<void> {
  const input = await loadInputs(args);
  const out = buildPacks(input);
  const retired = new Set(
    (await readFile(join(root, "content/retired-ids.txt"), "utf8"))
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#")),
  );
  const known =
    (
      parse(await readFile(join(root, "content/overrides/known-geometry-issues.yaml"), "utf8"), {
        schema: "core",
      }) as { issues?: KnownGeometryIssue[] } | null
    )?.issues ?? [];
  const issues = [
    ...validate(
      contentSetFromBuild(input, out, {
        fullSets: true,
        retiredIds: retired,
        release: flag(args, "release"),
        knownGeometryIssues: known,
        knownCapitalIssues:
          (
            parse(
              await readFile(join(root, "content/overrides/known-capital-issues.yaml"), "utf8"),
              { schema: "core" },
            ) as { issues?: KnownCapitalIssue[] } | null
          )?.issues ?? [],
      }),
    ),
    ...(flag(args, "no-determinism") ? [] : checkDeterminism(() => buildPacks(input))),
  ];
  const verbose = flag(args, "verbose");
  const shown = verbose ? issues : issues.slice(0, 40);
  for (const i of shown)
    console.log(`${i.level === "error" ? "ERROR" : "warn "} ${i.code.padEnd(18)} ${i.message}`);
  if (shown.length < issues.length)
    console.log(`… and ${issues.length - shown.length} more (use --verbose)`);
  const errors = errorsOf(issues);
  const byCode = new Map<string, number>();
  for (const i of issues)
    byCode.set(`${i.level} ${i.code}`, (byCode.get(`${i.level} ${i.code}`) ?? 0) + 1);
  log(
    `validate: ${errors.length} errors, ${issues.length - errors.length} warnings ${JSON.stringify(Object.fromEntries(byCode))}`,
  );
  if (errors.length > 0) process.exit(1);
}

/** Generates or extends the Silhouette daily schedule: `daily --from 2026-11-01 --days 730` or `daily --extend-to 2028-12-31`. */
async function cmdDaily(args: string[]): Promise<void> {
  const input = await loadInputs(args);
  const out = buildPacks({ ...input, daily: [] });
  const core = JSON.parse(
    new TextDecoder().decode(out.files.find((f) => f.name === "core.countries")?.bytes),
  ) as {
    entities: {
      id: string;
      parent_ids: string[];
      sets?: string[];
      area_km2?: { value: number };
      difficulty?: { shape: number };
    }[];
  };
  const pool = core.entities
    .filter((e) => e.sets?.includes("sovereign-197"))
    .map((e) => ({
      id: e.id,
      continent: e.parent_ids.find((p) => p.startsWith("continent:")) ?? "",
      areaKm2: e.area_km2?.value ?? 0,
      shape: e.difficulty?.shape ?? 0.5,
    }));
  const existing = (await readDaily())[0];
  const from = option(args, "from") ?? existing?.from;
  if (!from) throw new Error("daily: pass --from YYYY-MM-DD for a new schedule");
  const to =
    option(args, "extend-to") ??
    new Date(
      Date.parse(`${from}T00:00:00Z`) + (Number(option(args, "days") ?? 730) - 1) * 86_400_000,
    )
      .toISOString()
      .slice(0, 10);
  const schedule = extendSchedule({ pool, existing, from, to, seed: "SILHOUETTE-DAILY-1" });
  await mkdir(dirname(path.dailySilhouette), { recursive: true });
  await writeFile(path.dailySilhouette, `${stableStringify(schedule)}\n`);
  log(`daily: ${schedule.from} to ${schedule.to} (${Object.keys(schedule.days).length} days)`);
}

const [command, ...rest] = process.argv.slice(2);
const commands: Record<string, (args: string[]) => Promise<void>> = {
  fetch: cmdFetch,
  build: cmdBuild,
  validate: cmdValidate,
  daily: cmdDaily,
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const run = command ? commands[command] : undefined;
  if (!run) {
    console.error(
      "usage: content <fetch [--update-lock] [--wikidata] | build [--version V] [--out DIR] [--released-at ISO] | validate [--release] [--verbose] [--no-determinism]>",
    );
    process.exit(2);
  }
  run(rest).catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
