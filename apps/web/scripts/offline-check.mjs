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
];

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
await page.goto(`${base}/play`, { waitUntil: "networkidle" });
await page.evaluate(() => navigator.serviceWorker.ready);
// The worker fetches routes and packs in the background; wait until the last one is stored.
await page.waitForFunction(
  async () => {
    const c = await caches.open("meridian-pages-v1");
    return !!(await c.match("/play/rank-it")) && (await caches.keys()).length >= 3;
  },
  null,
  { timeout: 60_000 },
);
await page.waitForTimeout(3000);

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
