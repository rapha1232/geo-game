// Checks the JavaScript budgets of ARCHITECTURE §13 against a production build (T1.20):
//   shell route (Home): ≤ 170 KB gzip of JS; each game route: ≤ 120 KB gzip beyond the shell's chunks.
// Run `pnpm --filter @meridian/web build` first. Exits 1 when a budget is exceeded.
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../.next/", import.meta.url));
const pages = JSON.parse(readFileSync(`${root}app-build-manifest.json`, "utf8")).pages;
const SHELL_KB = 170;
const GAME_KB = 120;
const GAMES = [
  "/play/silhouette/page",
  "/play/silhouette/daily/page",
  "/play/silhouette/challenge/page",
  "/play/quiz/page",
  "/play/quiz/[slug]/page",
  "/play/fact-pin/page",
  "/daily/page",
  "/me/page",
  "/settings/page",
];

const sizes = new Map();
const gz = (file) => {
  if (!sizes.has(file)) sizes.set(file, gzipSync(readFileSync(root + file)).length);
  return sizes.get(file);
};
const js = (route) => (pages[route] ?? []).filter((f) => f.endsWith(".js"));
const kb = (bytes) => (bytes / 1024).toFixed(1);

const shell = new Set(js("/page"));
const shellBytes = [...shell].reduce((n, f) => n + gz(f), 0);
let failed = false;
const row = (name, bytes, limit) => {
  const ok = bytes / 1024 <= limit;
  if (!ok) failed = true;
  console.log(`${ok ? "✓" : "✗"} ${name.padEnd(36)} ${kb(bytes).padStart(7)} KB  (limit ${limit})`);
};
row("shell (Home)", shellBytes, SHELL_KB);
for (const route of GAMES) {
  if (!pages[route]) continue;
  const own = js(route).filter((f) => !shell.has(f));
  row(
    route.replace(/\/page$/, ""),
    own.reduce((n, f) => n + gz(f), 0),
    GAME_KB,
  );
}
process.exit(failed ? 1 : 0);
