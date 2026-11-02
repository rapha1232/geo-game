// Offline check (T2.4, AC-PL-030): visit once online, let the service worker warm its caches, go offline, and open
// every R1 game. Run against `next start -p 3111`.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const base = process.argv[2] ?? "http://localhost:3111";

const GAMES = [
  ["/play/silhouette", /Silhouette/],
  ["/play/quiz/countries-of-the-world", /Countries/],
  ["/play/fact-pin", /Fact Pin/],
  ["/play/border-run", /Border Run/],
  ["/play/rank-it", /Rank It/],
  ["/play/deep-cut", /Deep Cut/],
  ["/play/subdivisions/usa", /United States/],
  ["/explore", /Atlas/],
];

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
await page.goto(`${base}/play`, { waitUntil: "networkidle" });
await page.evaluate(() => navigator.serviceWorker.ready);
// The worker fetches routes and packs in the background; wait until the last route and every pack it warms (all but
// the 10m map, per sw.js SKIP_WARM) are stored. Cache names are found by prefix, so a worker version bump can't make
// this wait on an empty cache. Polled with page.evaluate: waitForFunction treats an async predicate's Promise as
// truthy and returns at once, which let this check go offline mid-warm and fail on whichever pages were not stored yet.
const warmed = () =>
  page.evaluate(async () => {
    const names = await caches.keys();
    const pagesName = names.find((n) => n.startsWith("meridian-pages-"));
    const contentName = names.find((n) => n.startsWith("meridian-content-"));
    if (!pagesName || !contentName) return false;
    if (!(await (await caches.open(pagesName)).match("/settings"))) return false;
    const m = await (await globalThis.fetch("/content/manifest.json")).json();
    const content = await caches.open(contentName);
    for (const e of Object.values(m.versions?.[m.current]?.packs ?? {})) {
      const href = new URL(e.url, globalThis.location.origin).href;
      if (!/geo\.world\.10m/.test(href) && !(await content.match(href))) return false;
    }
    return true;
  });
const deadline = Date.now() + 180_000;
while (!(await warmed())) {
  if (Date.now() > deadline)
    throw new Error("The service worker did not finish warming its caches in 3 minutes.");
  await page.waitForTimeout(1000);
}

await context.setOffline(true);
let failed = 0;
for (const [path, heading] of GAMES) {
  const p = await context.newPage();
  try {
    await p.goto(`${base}${path}`, { waitUntil: "load", timeout: 20_000 });
    await p.getByRole("heading", { name: heading }).first().waitFor({ timeout: 15_000 });
    // A game is playable offline when its data came from the caches, not the network.
    await p.waitForFunction(
      () =>
        !document.body.innerText.includes("couldn't load") &&
        !document.body.innerText.includes("didn't load"),
      null,
      { timeout: 15_000 },
    );
    console.log(`✓ ${path} opens offline`);
  } catch (e) {
    failed++;
    console.log(`✗ ${path}: ${String(e).split("\n")[0]}`);
  }
  await p.close();
}
await browser.close();
if (failed > 0) process.exit(1);
console.log("Offline check passed.");
