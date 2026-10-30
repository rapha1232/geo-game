// AC-PL-003: no route makes a request to a third-party origin at runtime. Walks the main routes and a game round
// and lists every request whose origin is not the app's own (the content host would be added to ALLOWED).
//   node apps/web/scripts/network-audit.mjs http://localhost:3111
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)("playwright");
const base = process.argv[2] ?? "http://localhost:3111";
const ALLOWED = new Set([new URL(base).origin]);
const ROUTES = [
  "/",
  "/play",
  "/play/silhouette",
  "/play/quiz",
  "/play/quiz/countries-of-the-world",
  "/play/fact-pin",
  "/daily",
  "/me",
  "/settings",
  "/about",
  "/about/rules",
  "/about/sources",
  "/about/corrections",
  "/privacy",
  "/terms",
];

const browser = await chromium.launch();
const foreign = new Map();
const page = await (await browser.newContext()).newPage();
page.on("request", (r) => {
  const u = new URL(r.url());
  if (u.protocol === "data:" || u.protocol === "blob:") return;
  if (!ALLOWED.has(u.origin)) foreign.set(r.url(), (foreign.get(r.url()) ?? 0) + 1);
});
for (const route of ROUTES) await page.goto(base + route, { waitUntil: "networkidle" });
await browser.close();
for (const url of foreign.keys()) console.log(`✗ third-party request: ${url}`);
console.log(
  foreign.size === 0
    ? `✓ ${ROUTES.length} routes: only ${[...ALLOWED].join(", ")}`
    : `${foreign.size} third-party request(s)`,
);
process.exit(foreign.size === 0 ? 0 : 1);
