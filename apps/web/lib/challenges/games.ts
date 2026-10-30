import { ChallengeError, decodeChallenge } from "@meridian/game-kit";
import { silhouetteChallengeConfig } from "./silhouette";

/** Games that can be challenged, with their short-code prefix and config validator (API_CONTRACTS §4.2). */
export const CHALLENGE_GAMES: Record<
  string,
  { prefix: string; config: { safeParse(v: unknown): { success: boolean } } }
> = {
  silhouette: { prefix: "SH", config: silhouetteChallengeConfig },
};

/** Why a payload was rejected, or null when it is a valid challenge for `gameId` in `contentVersion`. */
export function validatePayload(
  gameId: string,
  payload: string,
  contentVersion: string,
): string | null {
  const game = CHALLENGE_GAMES[gameId];
  if (!game) return `Challenges are not available for ${gameId} yet.`;
  try {
    const p = decodeChallenge(payload);
    if (p.g !== gameId) return "The payload is for a different game.";
    if (p.cv !== contentVersion) return "content_version does not match the payload.";
    if (!game.config.safeParse(p.c).success) return "The challenge config is not valid.";
    return null;
  } catch (e) {
    return e instanceof ChallengeError ? e.message : "The payload is not a challenge code.";
  }
}

const DAY_MS = 86_400_000;
export const RETENTION_DAYS = 180;

/**
 * A content version `YYYY.MM.N` is certainly expired once the end of its month plus 180 days has passed
 * (DATA_AND_CONTENT §8.4). The exact release date is not stored with a code, so this is the safe bound.
 */
export function isVersionExpired(version: string, nowMs: number): boolean {
  const m = /^(\d{4})\.(\d{2})\.\d+$/.exec(version);
  if (!m) return false;
  const monthEnd = Date.UTC(Number(m[1]), Number(m[2]), 1);
  return nowMs > monthEnd + RETENTION_DAYS * DAY_MS;
}
