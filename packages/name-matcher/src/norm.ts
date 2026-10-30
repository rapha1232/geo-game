/**
 * Normalization `norm(s)` (quiz-library §5.1). Applied identically to aliases at build time and to input at runtime.
 */

export const MAX_INPUT_LENGTH = 80;

const FOLD: Record<string, string> = {
  ß: "ss",
  ẞ: "ss",
  æ: "ae",
  Æ: "ae",
  œ: "oe",
  Œ: "oe",
  ø: "o",
  Ø: "o",
  ł: "l",
  Ł: "l",
  đ: "d",
  Đ: "d",
  ð: "d",
  Ð: "d",
  þ: "th",
  Þ: "th",
  ı: "i",
};

const TOKEN_REWRITES: Record<string, string> = {
  st: "saint",
  ste: "sainte",
  mt: "mount",
  ft: "fort",
  rep: "republic",
  dem: "democratic",
};

export function norm(input: string): string {
  // 1. Trim and cap at 80 characters.
  let s = input.trim().slice(0, MAX_INPUT_LENGTH);
  // 2. NFKD, remove combining marks.
  s = s.normalize("NFKD").replace(/\p{M}/gu, "");
  // 3. Fold special letters.
  s = s.replace(/[ßẞæÆœŒøØłŁđĐðÐþÞı]/g, (c) => FOLD[c] ?? c);
  // 4. Lowercase (locale-independent).
  s = s.toLowerCase();
  // 5. & → " and ".
  s = s.replace(/&/g, " and ");
  // 6. Everything outside [a-z0-9] becomes a space; collapse whitespace.
  const tokens = s
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter((t) => t !== "");
  // 7. Token rewrites (whole tokens only); `is` → `island` only as the last token.
  const rewritten = tokens.map((t, i) =>
    t === "is" && i === tokens.length - 1 ? "island" : (TOKEN_REWRITES[t] ?? t),
  );
  // 8. Drop a leading `the`.
  if (rewritten[0] === "the") rewritten.shift();
  // 9. Remove all spaces.
  return rewritten.join("");
}

/** True when the input has letters but none of them are Latin (R1 indexes Latin-script aliases only). */
export function hasOnlyNonLatinLetters(input: string): boolean {
  const withoutLatin = input.slice(0, MAX_INPUT_LENGTH).replace(/\p{Script=Latin}/gu, "");
  return /\p{L}/u.test(withoutLatin);
}
