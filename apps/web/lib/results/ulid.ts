const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** A ULID: 10 characters of millisecond time, 16 of randomness. `random` supplies 16 bytes. */
export function ulid(now: number, random: Uint8Array): string {
  let t = Math.floor(now);
  let time = "";
  for (let i = 0; i < 10; i++) {
    time = ALPHABET[t % 32] + time;
    t = Math.floor(t / 32);
  }
  let rand = "";
  for (let i = 0; i < 16; i++) rand += ALPHABET[(random[i] ?? 0) % 32];
  return time + rand;
}

export const randomUlid = (now: number): string =>
  ulid(now, crypto.getRandomValues(new Uint8Array(16)));
