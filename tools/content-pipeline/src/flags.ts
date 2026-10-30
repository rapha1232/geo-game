import { gunzipSync } from "node:zlib";
import { z } from "zod";

/** Reads regular files out of a gzipped tarball (just enough tar for the flag-icons package). */
export function readTgz(bytes: Uint8Array): Map<string, Uint8Array> {
  const tar = gunzipSync(bytes);
  const files = new Map<string, Uint8Array>();
  let offset = 0;
  const text = (from: number, len: number): string =>
    new TextDecoder().decode(tar.subarray(from, from + len)).replace(/\0.*$/s, "");
  while (offset + 512 <= tar.length) {
    const name = text(offset, 100);
    if (name === "") break;
    const size = parseInt(text(offset + 124, 12).trim() || "0", 8);
    const type = text(offset + 156, 1);
    const prefix = text(offset + 345, 155);
    const body = offset + 512;
    if (type === "0" || type === "")
      files.set(prefix ? `${prefix}/${name}` : name, tar.subarray(body, body + size));
    offset = body + Math.ceil(size / 512) * 512;
  }
  return files;
}

/**
 * The 4:3 flag of an ISO alpha-2 code from the flag-icons tarball, minified: whitespace between tags is dropped and
 * the library's `id` is removed, so several flags can sit in one page without clashing.
 */
export function extractFlags(tgz: Uint8Array, iso2: readonly string[]): Map<string, string> {
  const files = readTgz(tgz);
  const out = new Map<string, string>();
  for (const code of iso2) {
    const raw = files.get(`package/flags/4x3/${code.toLowerCase()}.svg`);
    if (!raw) continue;
    out.set(
      code.toUpperCase(),
      new TextDecoder()
        .decode(raw)
        .replace(/\sid="flag-icons-[a-z0-9-]+"/, "")
        .replace(/>\s+</g, "><")
        .replace(/\s+/g, " ")
        .trim(),
    );
  }
  return out;
}

/** `content/flags/confusables.yaml`: groups of flags players mix up. Editorial judgment, reviewed in PRs. */
export const confusablesFile = z
  .object({ groups: z.array(z.array(z.string().regex(/^[A-Z]{3}$/)).min(2)) })
  .strict();

/** For each code, the other members of every group it is in. */
export function confusablesByCode(groups: readonly (readonly string[])[]): Map<string, string[]> {
  const out = new Map<string, Set<string>>();
  for (const g of groups)
    for (const a of g)
      for (const b of g) if (a !== b) (out.get(a) ?? out.set(a, new Set()).get(a)!).add(b);
  return new Map([...out].map(([k, v]) => [k, [...v].sort()]));
}
