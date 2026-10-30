/** Crockford base32 (no I, L, O, U). Used for seeds and short codes. */
export const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export const SEED_LENGTH = 10;
const SEED_RE = /^[0-9A-HJKMNP-TV-Z]{10}$/;

/** Encode bytes as base32, 5 bits per character, taking the leading bits (MSB first). */
export function encodeBase32(bytes: Uint8Array, length: number): string {
  let out = "";
  let bits = 0;
  let acc = 0;
  for (const byte of bytes) {
    acc = (acc << 8) | byte;
    bits += 8;
    while (bits >= 5 && out.length < length) {
      out += CROCKFORD[(acc >>> (bits - 5)) & 31];
      bits -= 5;
    }
    acc &= (1 << bits) - 1;
    if (out.length >= length) return out;
  }
  if (bits > 0 && out.length < length) out += CROCKFORD[(acc << (5 - bits)) & 31];
  return out;
}

/** Build a 10-character seed (50 bits) from random bytes. Callers pass `crypto.getRandomValues`. */
export function seedFromBytes(bytes: Uint8Array): string {
  if (bytes.length < 7) throw new RangeError("seedFromBytes needs at least 7 bytes");
  return encodeBase32(bytes, SEED_LENGTH);
}

export const isSeed = (s: unknown): s is string => typeof s === "string" && SEED_RE.test(s);

/** Normalize user-typed Crockford text: uppercase, I/L→1, O→0, strip separators. */
export function normalizeCrockford(s: string): string {
  return s.toUpperCase().replace(/[\s-]/g, "").replace(/[IL]/g, "1").replace(/O/g, "0");
}
