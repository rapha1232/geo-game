import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { colorTokens, contrastRatio, type ColorToken } from "../src/index";

const css = readFileSync(resolve(process.cwd(), "src/styles/tokens.css"), "utf8");

/** Extract `--color-*` declarations from the block that starts at `selector`. */
function colorsIn(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`selector not found: ${selector}`);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  const out: Record<string, string> = {};
  for (const m of css.slice(open, close).matchAll(/--color-([a-z-]+):\s*(#[0-9A-Fa-f]{6});/g))
    out[m[1] as string] = (m[2] as string).toUpperCase();
  return out;
}

const upper = (o: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v.toUpperCase()]));

describe("tokens.css parity", () => {
  it("light values match tokens.ts", () =>
    expect(colorsIn(":root {")).toEqual(upper(colorTokens.light)));
  it("dark values match tokens.ts in both the media query and the [data-theme] override", () => {
    expect(colorsIn(':root:not([data-theme="light"]) {')).toEqual(upper(colorTokens.dark));
    expect(colorsIn(':root[data-theme="dark"] {')).toEqual(upper(colorTokens.dark));
  });
});

type Pair = { fg: ColorToken; bg: ColorToken; min: number; why: string };

/**
 * Minimums: 4.5 for text, 3 for UI components and graphics (WCAG 1.4.3, 1.4.11).
 * Feedback colours are graphics paired with a glyph, so they need 3:1. Message text stays in `text`.
 * Map tokens (ocean, land, border-map) are verified with the GameMap in T0.10.
 */
const PAIRS: Pair[] = [
  { fg: "text", bg: "bg", min: 4.5, why: "body on page" },
  { fg: "text", bg: "surface", min: 4.5, why: "body on card" },
  { fg: "text-muted", bg: "bg", min: 4.5, why: "secondary text on page" },
  { fg: "text-muted", bg: "surface", min: 4.5, why: "secondary text on card" },
  { fg: "text-on-accent", bg: "accent", min: 4.5, why: "primary button label" },
  { fg: "accent", bg: "bg", min: 4.5, why: "links and highlights on page" },
  { fg: "accent", bg: "surface", min: 4.5, why: "links and highlights on card" },
  { fg: "border-strong", bg: "bg", min: 3, why: "input and button borders on page" },
  { fg: "border-strong", bg: "surface", min: 3, why: "input and button borders on card" },
  { fg: "correct", bg: "bg", min: 3, why: "correct marker on page" },
  { fg: "correct", bg: "surface", min: 3, why: "correct marker on card" },
  { fg: "wrong", bg: "bg", min: 3, why: "wrong marker on page" },
  { fg: "wrong", bg: "surface", min: 3, why: "wrong marker on card" },
  { fg: "near", bg: "bg", min: 3, why: "near marker on page" },
  { fg: "near", bg: "surface", min: 3, why: "near marker on card" },
  { fg: "focus", bg: "bg", min: 3, why: "focus ring on page" },
  { fg: "focus", bg: "surface", min: 3, why: "focus ring on card" },
];

describe("AC-PL-005 token contrast", () => {
  for (const theme of ["light", "dark"] as const) {
    for (const p of PAIRS) {
      it(`${theme}: ${p.fg} on ${p.bg} ≥ ${p.min} (${p.why})`, () => {
        const t = colorTokens[theme];
        expect(contrastRatio(t[p.fg], t[p.bg])).toBeGreaterThanOrEqual(p.min);
      });
    }
  }
});

describe("AC-PL-007 focus indicator", () => {
  for (const theme of ["light", "dark"] as const) {
    it(`${theme}: the focus ring is ≥ 3:1 against the colours it sits next to`, () => {
      const t = colorTokens[theme];
      for (const adjacent of [t.bg, t.surface])
        expect(contrastRatio(t.focus, adjacent)).toBeGreaterThanOrEqual(3);
    });
  }
  it("the ring is offset from the element, so it never touches the accent fill (focus on accent is only ~1.3:1)", () => {
    const base = readFileSync(resolve(process.cwd(), "src/styles/base.css"), "utf8");
    expect(base).toMatch(/:focus-visible\s*\{[^}]*outline-offset:\s*2px/);
    const button = readFileSync(resolve(process.cwd(), "src/components/Button.module.css"), "utf8");
    expect(button).toMatch(/\[data-focus-visible\]\s*\{[^}]*outline-offset:\s*2px/);
  });
  it("the base stylesheet gives every :focus-visible a 3 px outline", () => {
    const base = readFileSync(resolve(process.cwd(), "src/styles/base.css"), "utf8");
    expect(base).toMatch(
      /:focus-visible\s*\{[^}]*outline:\s*var\(--focus-ring-width\)\s+solid\s+var\(--color-focus\)/,
    );
    expect(css).toContain("--focus-ring-width: 3px;");
  });
});
