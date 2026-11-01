import { describe, expect, it } from "vitest";
import { buildWorld, type SilEntity } from "@meridian/silhouette";
import {
  DEFAULT_CONFIG,
  answerNeighborsAt,
  followUpsCorrect,
  guess,
  newSession,
  points,
} from "../lib/silhouette/controller";

const mk = (id: string, name: string, continent = "EU"): SilEntity => ({
  id: `country:${id}`,
  name,
  aliases: [],
  type: "country",
  continent,
  areaKm2: 1000,
  ref: [0, 0],
  shape: 0.3,
  sets: ["sovereign-197"],
  capitals: [`${name} City`],
  remote: [],
});
const ents = [
  mk("FRA", "France"),
  mk("ESP", "Spain"),
  mk("DEU", "Germany"),
  mk("ITA", "Italy"),
  mk("JPN", "Japan", "AS"),
];
const edges = [
  { a: "country:ESP", b: "country:FRA" },
  { a: "country:DEU", b: "country:FRA" },
  { a: "country:FRA", b: "country:ITA" },
];
const world = buildWorld(ents, edges);
const start = () => {
  const s = newSession(world, "SEED", { ...DEFAULT_CONFIG, followUps: ["neighbors"] });
  return { ...s, round: { ...s.round, targetId: "country:FRA" } };
};
const solved = () => guess(world, start(), "France", 1000);

describe("Neighbors follow-up flow", () => {
  it("appears after the round and scores 1 when every neighbour is selected and nothing else", () => {
    let s = solved();
    expect(s.phase).toBe("followups");
    expect(s.followUps).toHaveLength(1);
    s = answerNeighborsAt(s, 0, ["country:ESP", "country:DEU", "country:ITA"]);
    expect(s.phase).toBe("learn");
    expect(followUpsCorrect(s)).toBe(1);
    expect(points(s)).toBe(6 + 1);
  });
  it("scores nothing for a miss or an extra, and allows one attempt", () => {
    const miss = answerNeighborsAt(solved(), 0, ["country:ESP", "country:DEU"]);
    expect(followUpsCorrect(miss)).toBe(0);
    const extra = answerNeighborsAt(solved(), 0, [
      "country:ESP",
      "country:DEU",
      "country:ITA",
      "country:JPN",
    ]);
    expect(followUpsCorrect(extra)).toBe(0);
    expect(answerNeighborsAt(miss, 0, ["country:ESP", "country:DEU", "country:ITA"])).toBe(miss);
  });
  it("is skipped for a target with no land neighbours", () => {
    const s0 = newSession(world, "SEED", { ...DEFAULT_CONFIG, followUps: ["neighbors"] });
    const s = guess(
      world,
      { ...s0, round: { ...s0.round, targetId: "country:JPN" } },
      "Japan",
      1000,
    );
    expect(s.phase).toBe("learn");
    expect(s.followUps).toHaveLength(0);
  });
});

import { bandState } from "../components/silhouette/GuessHeatMap";
describe("Proximity heat-map assist", () => {
  it("fills a guess solid when very close, dotted when near and hatched when far", () => {
    expect(bandState(90)).toBe("correct");
    expect(bandState(66)).toBe("correct");
    expect(bandState(40)).toBe("near");
    expect(bandState(10)).toBe("wrong");
  });
});
