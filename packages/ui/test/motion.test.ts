import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** All .css files under the given roots. */
function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === "node_modules" || name === ".next") return [];
    const p = join(dir, name);
    return statSync(p).isDirectory() ? cssFiles(p) : p.endsWith(".css") ? [p] : [];
  });
}

type Decl = {
  prop: string;
  value: string;
  inNoPreference: boolean;
  inReduce: boolean;
  file: string;
};

/** Minimal scanner: tracks @media nesting by braces. Good enough for our hand-written CSS. */
function declarations(file: string): Decl[] {
  const src = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const out: Decl[] = [];
  const stack: { media: string | null }[] = [];
  let i = 0;
  let buf = "";
  while (i < src.length) {
    const c = src[i] as string;
    if (c === "{") {
      const header = buf.trim();
      stack.push({ media: header.startsWith("@media") ? header : null });
      buf = "";
    } else if (c === "}") {
      pushDecl(buf);
      buf = "";
      stack.pop();
    } else if (c === ";") {
      pushDecl(buf);
      buf = "";
    } else buf += c;
    i++;
  }
  function pushDecl(text: string): void {
    const m = /^\s*([a-z-]+)\s*:\s*([\s\S]+?)\s*$/.exec(text);
    if (!m || stack.length === 0) return;
    const medias = stack.map((s) => s.media).filter((x): x is string => x !== null);
    out.push({
      prop: m[1] as string,
      value: m[2] as string,
      file,
      inNoPreference: medias.some((x) => x.includes("prefers-reduced-motion: no-preference")),
      inReduce: medias.some((x) => x.includes("prefers-reduced-motion: reduce")),
    });
  }
  return out;
}

const roots = [resolve(process.cwd(), "src"), resolve(process.cwd(), "../../apps/web/app")];
const all = roots.flatMap(cssFiles).flatMap(declarations);

const MOVEMENT =
  /(transform|translate|rotate|scale|top|left|right|bottom|inset|margin|width|height|padding|\ball\b)/;

describe("AC-PL-009 reduced motion (CSS level)", () => {
  it("finds stylesheets to check", () => expect(all.length).toBeGreaterThan(50));

  it("every animation lives inside prefers-reduced-motion: no-preference (the reduce backstop excepted)", () => {
    const bad = all.filter(
      (d) =>
        /^animation(-name)?$/.test(d.prop) &&
        !/^none\b/.test(d.value) &&
        !d.inNoPreference &&
        !d.inReduce,
    );
    expect(bad.map((d) => `${d.file}: ${d.prop}: ${d.value}`)).toEqual([]);
  });

  it("transitions outside no-preference only touch colour and opacity (no transform or position)", () => {
    const bad = all.filter(
      (d) =>
        /^transition(-property)?$/.test(d.prop) &&
        !d.inNoPreference &&
        MOVEMENT.test(d.value.replace(/var\([^)]*\)/g, "")),
    );
    expect(bad.map((d) => `${d.file}: ${d.prop}: ${d.value}`)).toEqual([]);
  });

  it("transform and translate are only declared inside no-preference blocks", () => {
    const bad = all.filter(
      (d) =>
        /^(transform|translate|rotate|scale)$/.test(d.prop) &&
        d.value !== "none" &&
        !d.inNoPreference,
    );
    expect(bad.map((d) => `${d.file}: ${d.prop}: ${d.value}`)).toEqual([]);
  });

  it("the base stylesheet has a reduce backstop that disables animation", () => {
    const backstop = all.filter((d) => d.file.endsWith("base.css") && d.inReduce);
    expect(backstop.some((d) => d.prop === "animation" && d.value.startsWith("none"))).toBe(true);
  });
});
