import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import { sourceRegistry } from "@meridian/schemas";
import type { NeCollection } from "../src/ne.ts";
import type { WdSnapshot } from "../src/wikidata.ts";
import type { BuildInput } from "../src/build.ts";
import { MEMBERS } from "./fixtures/members.ts";

const here = (p: string): string => resolve(process.cwd(), "test/fixtures", p);
export const readJson = <T>(p: string): T => JSON.parse(readFileSync(here(p), "utf8")) as T;
export const repoPath = (p: string): string => resolve(process.cwd(), "../..", p);

export const registry = () =>
  sourceRegistry.parse(
    parse(readFileSync(repoPath("data/sources.registry.yaml"), "utf8"), { schema: "core" }),
  );

export function fixtureInput(over: Partial<BuildInput> = {}): BuildInput {
  return {
    version: "2026.10.0",
    releasedAt: "2026-10-30T12:00:00Z",
    members: MEMBERS,
    ne: {
      "110m": readJson<NeCollection>("ne-110m.json"),
      "50m": readJson<NeCollection>("ne-50m.json"),
      "10m": readJson<NeCollection>("ne-10m.json"),
    },
    wikidata: readJson<WdSnapshot>("wikidata.json"),
    registry: registry(),
    ...over,
  };
}
