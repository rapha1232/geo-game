import { buildWorld, type SilEntity } from "@meridian/silhouette";
import { buildGraph, type BrWorld, type Edge } from "../src";

const ENTITIES: [string, string, string][] = [
  ["ESP", "Spain", "EU"],
  ["PRT", "Portugal", "EU"],
  ["FRA", "France", "EU"],
  ["DEU", "Germany", "EU"],
  ["POL", "Poland", "EU"],
  ["ITA", "Italy", "EU"],
  ["CHE", "Switzerland", "EU"],
  ["AUT", "Austria", "EU"],
  ["CZE", "Czechia", "EU"],
  ["BEL", "Belgium", "EU"],
  ["GBR", "United Kingdom", "EU"],
  ["JPN", "Japan", "AS"],
  ["MAR", "Morocco", "AF"],
];

export const entities: SilEntity[] = ENTITIES.map(([id, name, continent]) => ({
  id: `country:${id}`,
  name,
  aliases: [],
  type: "country",
  continent,
  areaKm2: 100_000,
  ref: [0, 0],
  shape: 0.5,
  sets: ["sovereign-197"],
  capitals: [],
  remote: [],
}));

const pair = (a: string, b: string): Edge => ({ a: `country:${a}`, b: `country:${b}` });

export const land: Edge[] = [
  pair("ESP", "PRT"),
  pair("ESP", "FRA"),
  pair("ESP", "MAR"),
  pair("FRA", "DEU"),
  pair("FRA", "BEL"),
  pair("FRA", "CHE"),
  pair("FRA", "ITA"),
  pair("DEU", "POL"),
  pair("DEU", "CHE"),
  pair("DEU", "AUT"),
  pair("DEU", "CZE"),
  pair("DEU", "BEL"),
  pair("CHE", "ITA"),
  pair("CHE", "AUT"),
  pair("ITA", "AUT"),
  pair("AUT", "CZE"),
  pair("CZE", "POL"),
];
export const tunnel: Edge[] = [pair("FRA", "GBR")];

export const id = (iso: string): string => `country:${iso}`;

export function makeWorld(crossings = false): BrWorld {
  const world = buildWorld(entities, land, []);
  const graph = buildGraph(
    entities.map((e) => e.id),
    land,
    crossings ? tunnel : [],
  );
  return { world, graph };
}
