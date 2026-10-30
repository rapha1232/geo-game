/* global document, getComputedStyle */
// Runs axe-core on every route and the main game states against a running server (T1.19, TESTING_AND_ACCEPTANCE §5).
//   pnpm --filter @meridian/web build && pnpm --filter @meridian/web exec next start -p 3111 &
//   node apps/web/scripts/a11y-audit.mjs http://localhost:3111
// Exits 1 when anything is found. Needs the pre-installed Playwright (resolved through NODE_PATH).
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const base = process.argv[2] ?? "http://localhost:3111";

const ROUTES = [
  "/",
  "/play",
  "/play/silhouette",
  "/play/quiz",
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

/** Game states reached by driving the page. */
const STATES = [
  {
    name: "fact-pin playing",
    path: "/play/fact-pin",
    async drive(p) {
      await p.getByRole("button", { name: "Start", exact: true }).click();
      await p.getByLabel("Or type a place").waitFor();
    },
  },
  {
    name: "fact-pin revealed",
    path: "/play/fact-pin",
    async drive(p) {
      await p.getByRole("button", { name: "Start", exact: true }).click();
      await p.getByLabel("Or type a place").fill("Paris");
      await p.keyboard.press("Enter");
      await p.keyboard.press("Enter");
      await p.getByText(/Answer:/).waitFor();
    },
  },
  {
    name: "quiz configure",
    path: "/play/quiz/countries-of-the-world",
    async drive(p) {
      await p.getByRole("button", { name: "Start", exact: true }).waitFor();
    },
  },
  {
    name: "quiz playing",
    path: "/play/quiz/countries-of-the-world",
    async drive(p) {
      await p.getByRole("button", { name: "Start", exact: true }).click();
      await p.getByRole("textbox").first().waitFor();
    },
  },
  {
    name: "quiz review",
    path: "/play/quiz/countries-of-the-world",
    async drive(p) {
      await p.getByRole("button", { name: "Start", exact: true }).click();
      await p.getByRole("button", { name: "Give up", exact: true }).click();
      await p.getByRole("button", { name: /play again/i }).waitFor();
    },
  },
  {
    name: "silhouette round",
    path: "/play/silhouette",
    async drive(p) {
      await p.locator("svg[role=img]").first().waitFor();
    },
  },
];

const browser = await chromium.launch();
let failures = 0;

async function audit(label, page, viewport) {
  const tag = `${viewport.width}px ${viewport.scheme}`;
  // AC-PL-006: no horizontal page scroll.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  if (overflow > 0) {
    failures++;
    console.log(`✗ ${label} [${tag}] horizontal scroll by ${overflow}px`);
  }
  if (!viewport.axe) {
    if (overflow <= 0) console.log(`✓ ${label} [${tag}] no horizontal scroll`);
    return;
  }
  await page.addScriptTag({ content: axeSource });
  const result = await page.evaluate(() =>
    // eslint-disable-next-line no-undef
    axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
    }),
  );
  const small =
    viewport.width < 600 && viewport.axe
      ? await page.evaluate(() =>
          [...document.querySelectorAll("button, a[href], [role=button]")]
            .filter((el) => {
              const r = el.getBoundingClientRect();
              const cs = getComputedStyle(el);
              return (
                r.width > 0 &&
                r.height > 0 &&
                cs.display !== "inline" &&
                (r.width < 44 || r.height < 44)
              );
            })
            .map(
              (el) =>
                `${el.tagName.toLowerCase()} "${(el.textContent ?? "").trim().slice(0, 30)}" ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`,
            ),
        )
      : [];
  for (const v of result.violations) {
    failures++;
    console.log(`✗ ${label} [${tag}] ${v.id} (${v.impact}): ${v.help}`);
    for (const n of v.nodes.slice(0, 3))
      console.log(`    ${n.target.join(" ")}  ${n.failureSummary?.split("\n")[1] ?? ""}`);
  }
  for (const s of small) {
    failures++;
    console.log(`✗ ${label} [${tag}] touch target under 44px: ${s}`);
  }
  if (result.violations.length === 0 && small.length === 0 && overflow <= 0)
    console.log(`✓ ${label} [${tag}]`);
}

// AC-PL-004: axe in light and dark at 390 and 1280. AC-PL-006: overflow at 320, 390, 768 and 1280.
const MATRIX = [
  { width: 1280, height: 900, scheme: "light", axe: true },
  { width: 1280, height: 900, scheme: "dark", axe: true },
  { width: 390, height: 800, scheme: "light", axe: true },
  { width: 390, height: 800, scheme: "dark", axe: true },
  { width: 768, height: 900, scheme: "light", axe: false },
  { width: 320, height: 700, scheme: "light", axe: false },
];
for (const viewport of MATRIX) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    colorScheme: viewport.scheme,
  });
  for (const route of ROUTES) {
    const page = await context.newPage();
    await page.goto(base + route, { waitUntil: "networkidle" });
    await audit(route, page, viewport);
    await page.close();
  }
  for (const s of STATES) {
    // A fresh profile per state, so a saved session never turns Start into a resume prompt.
    const fresh = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      colorScheme: viewport.scheme,
    });
    const page = await fresh.newPage();
    await page.goto(base + s.path, { waitUntil: "networkidle" });
    try {
      await s.drive(page);
      await audit(s.name, page, viewport);
    } catch (e) {
      failures++;
      console.log(`✗ ${s.name}: could not reach the state (${String(e).split("\n")[0]})`);
    }
    await fresh.close();
  }
  await context.close();
}
await browser.close();
console.log(failures === 0 ? "No findings." : `${failures} finding(s).`);
process.exit(failures === 0 ? 0 : 1);
