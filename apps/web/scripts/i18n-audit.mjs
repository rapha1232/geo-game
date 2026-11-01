// Visits every route and fails when a message key shows up as text or a string is missing (a game module not loaded).
// Run against `next start -p 3111`.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const base = process.argv[2] ?? "http://localhost:3111";
const ROUTES = [
  "/",
  "/play",
  "/play/silhouette",
  "/play/quiz",
  "/play/quiz/countries-of-the-world",
  "/play/quiz/landlocked-countries",
  "/play/quiz/match-the-capitals",
  "/play/quiz/daily",
  "/play/fact-pin",
  "/play/border-run",
  "/play/rank-it",
  "/play/deep-cut",
  "/play/deep-cut/daily",
  "/play/subdivisions",
  "/play/subdivisions/usa",
  "/daily",
  "/explore",
  "/explore/country:PER",
  "/me",
  "/me/achievements",
  "/settings",
  "/about",
  "/about/rules",
  "/about/sources",
  "/about/corrections",
  "/privacy",
  "/terms",
];
const KEY =
  /\b(?:qz|at|fp|sil|rk|br|dc|me|set|daily|ch|sb|rp|cat|ach|home|nav)\.[a-z][A-Za-z0-9-]*(?:\.[A-Za-z0-9-]+)*\b/;
const browser = await chromium.launch();
let failed = 0;
for (const r of ROUTES) {
  const p = await browser.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(`${base}${r}`, { waitUntil: "networkidle" });
  await p.waitForTimeout(1200);
  const text = await p.locator("body").innerText();
  const hit = text.match(KEY);
  const bad = text.includes("undefined") || text.includes("[object");
  if (hit || bad || errors.length) {
    failed++;
    console.log(`✗ ${r}: ${hit ? `key "${hit[0]}"` : bad ? "undefined text" : errors[0]}`);
  } else console.log(`✓ ${r}`);
  await p.close();
}
await browser.close();
if (failed) process.exit(1);
console.log("i18n audit passed.");
