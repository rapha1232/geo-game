import { formatShortCode, parseShortCode } from "@meridian/game-kit";
import {
  createChallengeRequest,
  createChallengeResponse,
  resolveChallengeResponse,
} from "@meridian/schemas";
import { PRODUCTION_URL } from "../brand";
import { CHALLENGE_GAMES, isVersionExpired, validatePayload } from "../challenges/games";
import { ApiError, jsonResponse, readJson } from "./problem";

export type ChallengeRow = {
  code: string;
  gameId: string;
  payload: string;
  contentVersion: string;
};

/** Storage seam: the Drizzle implementation lives in `challenge-store.ts`, tests use an in-memory one. */
export interface ChallengeStore {
  findByHash(hash: string): Promise<{ code: string } | null>;
  /** Returns false when the code is already taken. */
  insert(row: ChallengeRow & { payloadHash: string }): Promise<boolean>;
  /** Counts a use and returns the row, or null when unknown. */
  use(code: string): Promise<ChallengeRow | null>;
}

export type Deps = {
  store: ChallengeStore | null;
  randomBytes: () => Uint8Array;
  now: () => number;
  origin?: string;
};

const stripDashes = (code: string): string => code.replaceAll("-", "");
const withDashes = (code: string): string =>
  `${code.slice(0, 2)}-${code.slice(2, 6)}-${code.slice(6)}`;

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const need = (store: ChallengeStore | null): ChallengeStore => {
  if (!store)
    throw new ApiError("UNAVAILABLE", {
      detail: "Short codes are unavailable right now. Use the long link.",
    });
  return store;
};

/** `POST /api/v1/challenges`: stores a long payload and returns its short code (an identical payload returns the same code). */
export async function createChallenge(req: Request, deps: Deps): Promise<Response> {
  const body = createChallengeRequest.parse(await readJson(req));
  const reason = validatePayload(body.game_id, body.payload, body.content_version);
  if (reason)
    throw new ApiError("VALIDATION_FAILED", { errors: [{ path: "payload", message: reason }] });
  const store = need(deps.store);
  const origin = deps.origin ?? new URL(req.url).origin ?? PRODUCTION_URL;
  const hash = await sha256Hex(body.payload);
  const existing = await store.findByHash(hash);
  const respond = (code: string, status: number) =>
    jsonResponse(
      createChallengeResponse.parse({
        code: withDashes(code),
        url: `${origin}/c/${withDashes(code)}`,
      }),
      { status },
    );
  if (existing) return respond(existing.code, 200);
  const prefix = (CHALLENGE_GAMES[body.game_id] as { prefix: string }).prefix;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = stripDashes(formatShortCode(prefix, deps.randomBytes()));
    const inserted = await store.insert({
      code,
      gameId: body.game_id,
      payload: body.payload,
      payloadHash: hash,
      contentVersion: body.content_version,
    });
    if (inserted) return respond(code, 201);
    // A concurrent request may have stored the same payload between our lookup and insert.
    const raced = await store.findByHash(hash);
    if (raced) return respond(raced.code, 200);
  }
  throw new ApiError("INTERNAL", { detail: "Could not allocate a short code." });
}

/** `GET /api/v1/challenges/{code}`: case- and dash-insensitive. 410 (with the same body) once the version has expired. */
export async function resolveChallenge(rawCode: string, deps: Deps): Promise<Response> {
  const canonical = parseShortCode(rawCode);
  if (!canonical) throw new ApiError("NOT_FOUND", { detail: "That challenge link isn't valid." });
  const row = await need(deps.store).use(stripDashes(canonical));
  if (!row) throw new ApiError("NOT_FOUND", { detail: "That challenge link isn't valid." });
  const body = resolveChallengeResponse.parse({
    game_id: row.gameId,
    payload: row.payload,
    content_version: row.contentVersion,
  });
  const expired = isVersionExpired(row.contentVersion, deps.now());
  return jsonResponse(body, {
    status: expired ? 410 : 200,
    headers: { "Cache-Control": "private, max-age=60" },
  });
}
