/* global window, PerformanceObserver */
// AC-PL-002 (indicative): Home LCP under a simulated slow-4G, mid-tier mobile profile, measured with Chromium.
// The release gate is Lighthouse (Moto G Power profile); this catches regressions without it.
//   node apps/web/scripts/lcp.mjs http://localhost:3111
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)("playwright");
const base = process.argv[2] ?? "http://localhost:3111";
const LIMIT_MS = 2500;
const browser = await chromium.launch();
const results = [];
for (let run = 0; run < 3; run++) {
  const context = await browser.newContext({
    viewport: { width: 412, height: 823 },
    deviceScaleFactor: 2.6,
    isMobile: true,
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.addInitScript(() => {
    window.__lcp = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.__lcp = e.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
  });
  await page.goto(base + "/", { waitUntil: "load" });
  await page.waitForTimeout(1500);
  results.push(Math.round(await page.evaluate(() => window.__lcp)));
  await context.close();
}
await browser.close();
results.sort((a, b) => a - b);
const median = results[1];
console.log(`LCP runs: ${results.join(", ")} ms; median ${median} ms (limit ${LIMIT_MS})`);
process.exit(median <= LIMIT_MS ? 0 : 1);
