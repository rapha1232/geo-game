/* global fetch */
// Site checks a unit test cannot see (status codes, headers, generated files). Run against `next start -p 3111`:
//   node apps/web/scripts/site-audit.mjs http://localhost:3111
// Exits 1 on any failure.
const base = process.argv[2] ?? "http://localhost:3111";
const failures = [];
const check = (ok, what) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failures.push(what);
};
const get = (path, init) => fetch(`${base}${path}`, { redirect: "manual", ...init });

// Unknown slugs and codes are real 404s, not soft 404s (search engines would index them).
for (const path of [
  "/no-such-page",
  "/play/quiz/no-such-quiz",
  "/play/subdivisions/xx",
  "/explore/ZZZ",
  "/explore/country:ZZZ",
  "/c/not-a-code",
])
  check((await get(path)).status === 404, `${path} answers 404`);

// Known pages answer 200, and a bare country code redirects to its canonical Atlas URL.
for (const path of [
  "/",
  "/play/quiz/countries-of-the-world",
  "/play/subdivisions/usa",
  "/explore/country:FRA",
])
  check((await get(path)).status === 200, `${path} answers 200`);
const bare = await get("/explore/fra");
check(
  bare.status === 308 && bare.headers.get("location")?.endsWith("/explore/country:FRA"),
  "/explore/fra redirects to /explore/country:FRA",
);

// Titles carry the brand, and a country's Atlas page names the country.
const html = await (await get("/play")).text();
check(/<title>Play · Meridian<\/title>/.test(html), "/play title is 'Play · Meridian'");
const fr = await (await get("/explore/country:FRA")).text();
check(/<title>France · Atlas · Meridian<\/title>/.test(fr), "Atlas page title names the country");

// Icons, link previews and crawler files.
for (const [path, type] of [
  ["/favicon.ico", "image/"],
  ["/icon.svg", "image/svg+xml"],
  ["/apple-touch-icon.png", "image/png"],
  ["/icon-192.png", "image/png"],
  ["/opengraph-image", "image/png"],
  ["/robots.txt", "text/plain"],
  ["/sitemap.xml", "application/xml"],
]) {
  const res = await get(path);
  check(
    res.status === 200 && (res.headers.get("content-type") ?? "").startsWith(type),
    `${path} is ${type}`,
  );
}
const home = await (await get("/")).text();
for (const tag of [
  'rel="icon"',
  'rel="apple-touch-icon"',
  'property="og:image"',
  'name="twitter:card"',
])
  check(home.includes(tag), `home <head> has ${tag}`);
const sitemap = await (await get("/sitemap.xml")).text();
check((sitemap.match(/<loc>/g) ?? []).length > 250, "sitemap lists the quizzes and Atlas places");

// Hash-named content packs are immutable; the manifest that points at them is not.
const manifest = await (await get("/content/manifest.json")).json();
const packUrl = Object.values(manifest.versions?.[manifest.current]?.packs ?? {})[0]?.url ?? null;
if (packUrl) {
  const res = await get(`/${packUrl}`);
  check(
    /immutable/.test(res.headers.get("cache-control") ?? ""),
    `${packUrl} is cached as immutable`,
  );
} else check(false, "manifest names a pack to check");
check(
  !/immutable/.test((await get("/content/manifest.json")).headers.get("cache-control") ?? ""),
  "manifest.json is not immutable",
);

// Health reports the content release.
const health = await (await get("/api/v1/health")).json();
check(
  typeof health.content_version === "string" && health.content_version.length > 0,
  "health reports content_version",
);

if (failures.length) {
  console.error(`\n${failures.length} site check(s) failed`);
  process.exit(1);
}
console.log("\nall site checks passed");
