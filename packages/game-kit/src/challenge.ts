import { Inflate, deflateSync } from "fflate";
import { CROCKFORD, encodeBase32, normalizeCrockford } from "./base32";
import { canonicalJSON } from "./canonical";

/** Challenge codes (ARCHITECTURE §8.4). */

export type ChallengePayload = {
  v: 1;
  /** game id */
  g: string;
  /** config, with short keys */
  c: unknown;
  /** seed */
  s: string;
  /** content version */
  cv: string;
  /** optional sender score */
  sc?: number;
};

export const MAX_CODE_LENGTH = 2048;
export const MAX_DECOMPRESSED = 8192;

export type ChallengeErrorCode = "too_long" | "malformed" | "unsupported_version" | "too_large";

export class ChallengeError extends Error {
  constructor(
    readonly code: ChallengeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ChallengeError";
  }
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export function base64urlEncode(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = ((bytes[i] as number) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64.charAt((n >>> 18) & 63) + B64.charAt((n >>> 12) & 63);
    if (i + 1 < bytes.length) out += B64.charAt((n >>> 6) & 63);
    if (i + 2 < bytes.length) out += B64.charAt(n & 63);
  }
  return out;
}

export function base64urlDecode(s: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(s) || s.length % 4 === 1)
    throw new ChallengeError("malformed", "bad base64url");
  const out = new Uint8Array(Math.floor((s.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < s.length; i += 4) {
    let n = 0;
    let chars = 0;
    for (let j = 0; j < 4 && i + j < s.length; j++, chars++)
      n = (n << 6) | B64.indexOf(s[i + j] as string);
    n <<= 6 * (4 - chars);
    out[o++] = (n >>> 16) & 255;
    if (chars > 2) out[o++] = (n >>> 8) & 255;
    if (chars > 3) out[o++] = n & 255;
  }
  return out;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

/** `base64url(deflateRaw(canonicalJSON(payload)))`. */
export function encodeChallenge(payload: ChallengePayload): string {
  const code = base64urlEncode(deflateSync(encoder.encode(canonicalJSON(payload)), { level: 9 }));
  if (code.length > MAX_CODE_LENGTH)
    throw new ChallengeError("too_long", "challenge code too long");
  return code;
}

function inflateLimited(data: Uint8Array): Uint8Array {
  const chunks: Uint8Array[] = [];
  let total = 0;
  let failure: ChallengeError | null = null;
  const inf = new Inflate((chunk) => {
    total += chunk.length;
    if (total > MAX_DECOMPRESSED)
      failure ??= new ChallengeError("too_large", "decompressed payload too large");
    else chunks.push(chunk);
  });
  try {
    // Feed in slices so an inflate bomb is rejected early.
    const step = 256;
    for (let i = 0; i < data.length && !failure; i += step)
      inf.push(data.subarray(i, i + step), i + step >= data.length);
  } catch {
    throw failure ?? new ChallengeError("malformed", "corrupt challenge data");
  }
  if (failure) throw failure;
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

/** Decode and structurally validate. Config validation (zod) is the game's job. */
export function decodeChallenge(code: string): ChallengePayload {
  if (code.length > MAX_CODE_LENGTH)
    throw new ChallengeError("too_long", "challenge code too long");
  let json: unknown;
  try {
    json = JSON.parse(decoder.decode(inflateLimited(base64urlDecode(code))));
  } catch (e) {
    if (e instanceof ChallengeError) throw e;
    throw new ChallengeError("malformed", "not a challenge code");
  }
  if (typeof json !== "object" || json === null)
    throw new ChallengeError("malformed", "not an object");
  const p = json as Record<string, unknown>;
  if (p.v !== 1) throw new ChallengeError("unsupported_version", "unknown challenge version");
  if (
    typeof p.g !== "string" ||
    typeof p.s !== "string" ||
    typeof p.cv !== "string" ||
    !("c" in p) ||
    (p.sc !== undefined && typeof p.sc !== "number")
  ) {
    throw new ChallengeError("malformed", "missing fields");
  }
  return p as unknown as ChallengePayload;
}

/** Short codes: `<PREFIX>-XXXX-XXXX`, 8 Crockford characters (40 bits). */
const SHORT_RE = /^([A-Z]{2,3})-([0-9A-HJKMNP-TV-Z]{4})-([0-9A-HJKMNP-TV-Z]{4})$/;

export function formatShortCode(prefix: string, bytes: Uint8Array): string {
  if (bytes.length < 5) throw new RangeError("short code needs at least 5 bytes");
  const s = encodeBase32(bytes, 8);
  return `${prefix}-${s.slice(0, 4)}-${s.slice(4)}`;
}

/** Parse user-typed short codes leniently (case, I/L/O confusions). Returns the canonical form or null. */
export function parseShortCode(input: string): string | null {
  const m = /^([A-Za-z]{2,3})[-\s]?(.{4})[-\s]?(.{4})$/.exec(input.trim());
  if (!m) return null;
  const canon = `${(m[1] as string).toUpperCase()}-${normalizeCrockford(m[2] as string)}-${normalizeCrockford(m[3] as string)}`;
  return SHORT_RE.test(canon) &&
    [...canon.replace(/-/g, "").slice(m[1]!.length)].every((c) => CROCKFORD.includes(c))
    ? canon
    : null;
}
