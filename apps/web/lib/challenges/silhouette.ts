import { z } from "zod";
import {
  ChallengeError,
  decodeChallenge,
  encodeChallenge,
  isSeed,
  makeRng,
  type ChallengePayload,
} from "@meridian/game-kit";
import {
  selectChallenge,
  targetPool,
  type Difficulty,
  type FollowUpKind,
  type PoolSpec,
  type World,
} from "@meridian/silhouette";

/** A Silhouette challenge's config, with short keys so the code stays short (ARCHITECTURE §8.4). */
export const silhouetteChallengeConfig = z
  .object({
    /** Target pool: s = sovereign-197, u = un-193, t = sovereign + territories. */
    p: z.enum(["s", "u", "t"]),
    /** Difficulty: e, n, h. */
    d: z.enum(["e", "n", "h"]),
    /** Number of shapes. */
    n: z.union([z.literal(5), z.literal(10)]),
    /** Follow-ups: c = capital, f = flag. */
    f: z.array(z.enum(["c", "f"])).max(2),
  })
  .strict();
export type SilhouetteChallengeConfig = z.infer<typeof silhouetteChallengeConfig>;

const POOLS: Record<SilhouetteChallengeConfig["p"], PoolSpec> = {
  s: { kind: "sovereign-197" },
  u: { kind: "un-193" },
  t: { kind: "sovereign+territories" },
};
const DIFFICULTY: Record<SilhouetteChallengeConfig["d"], Difficulty> = {
  e: "easy",
  n: "normal",
  h: "hard",
};
const FOLLOW: Record<"c" | "f", FollowUpKind> = { c: "capital", f: "flag" };

export const poolOf = (c: SilhouetteChallengeConfig): PoolSpec => POOLS[c.p];
export const difficultyOf = (c: SilhouetteChallengeConfig): Difficulty => DIFFICULTY[c.d];
export const followUpsOf = (c: SilhouetteChallengeConfig): FollowUpKind[] =>
  c.f.map((k) => FOLLOW[k]);

export const DEFAULT_CHALLENGE: SilhouetteChallengeConfig = { p: "s", d: "n", n: 5, f: ["c", "f"] };

export type ParsedChallenge = { payload: ChallengePayload; config: SilhouetteChallengeConfig };

/** The long code (`/c/<code>`, always available offline). */
export function encodeSilhouetteChallenge(input: {
  config: SilhouetteChallengeConfig;
  seed: string;
  contentVersion: string;
  senderScore?: number;
}): string {
  return encodeChallenge({
    v: 1,
    g: "silhouette",
    c: silhouetteChallengeConfig.parse(input.config),
    s: input.seed,
    cv: input.contentVersion,
    ...(input.senderScore !== undefined ? { sc: input.senderScore } : {}),
  });
}

/** Decodes and validates a long code for Silhouette. Throws `ChallengeError` for anything wrong with it. */
export function parseSilhouetteChallenge(code: string): ParsedChallenge {
  const payload = decodeChallenge(code);
  if (payload.g !== "silhouette")
    throw new ChallengeError("malformed", "not a Silhouette challenge");
  if (!isSeed(payload.s)) throw new ChallengeError("malformed", "bad seed");
  const config = silhouetteChallengeConfig.safeParse(payload.c);
  if (!config.success) throw new ChallengeError("malformed", "bad challenge config");
  return { payload, config: config.data };
}

/** The same targets in the same order for everyone with the same content (AC-PL-015). */
export function challengeTargets(
  world: World,
  config: SilhouetteChallengeConfig,
  seed: string,
): string[] {
  const pool = targetPool(world, poolOf(config), difficultyOf(config));
  const rng = makeRng(seed, "silhouette", { p: config.p, d: config.d, n: config.n }).fork(
    "challenge",
  );
  return selectChallenge(world, pool, difficultyOf(config), config.n, rng).ids;
}
