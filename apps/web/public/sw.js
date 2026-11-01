/* Meridian service worker (T2.4). Plain JavaScript on purpose: it is served as-is from /sw.js.
 *
 * - Pages: network first, the last good copy when the network fails, a small offline page as the last resort.
 * - /_next/static and icons: cache first (the file names carry a content hash).
 * - Content packs (/content/...): cache first for hashed pack files, network first for manifest.json.
 * - A "warm" message from the page fetches the game routes and the R1 packs once, so every R1 game works offline
 *   after one online visit (AC-PL-030).
 * Results are stored on the device; syncing them arrives with accounts (T2.1, T2.2).
 */
const VERSION = "v1";
const PAGES = `meridian-pages-${VERSION}`;
const STATIC = `meridian-static-${VERSION}`;
const CONTENT = `meridian-content-${VERSION}`;
const KEEP = new Set([PAGES, STATIC, CONTENT]);

const OFFLINE_HTML =
  '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<title>Offline</title><main style="font-family:system-ui;max-width:32rem;margin:4rem auto;padding:0 1rem">' +
  "<h1>You're offline</h1><p>Games you've played recently still work. Open one from your recent pages, " +
  'or <a href="/play">try the game list</a> once you are back online.</p></main>';

/** Pack files big enough to leave to on-demand loading. */
const SKIP_WARM = /geo\.world\.10m/;
/** The routes every R1 game needs; their scripts are found in the page HTML. */
const WARM_ROUTES = [
  "/",
  "/play",
  "/play/silhouette",
  "/play/quiz",
  "/play/fact-pin",
  "/play/border-run",
  "/play/rank-it",
  "/play/deep-cut",
  "/explore",
  "/daily",
  "/me",
  "/settings",
];

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) if (!KEEP.has(name)) await caches.delete(name);
      await self.clients.claim();
    })(),
  );
});

const isStatic = (url) => url.pathname.startsWith("/_next/static/") || url.pathname === "/icon.svg";
const isContent = (url) => url.pathname.startsWith("/content/");

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) await cache.put(request, res.clone());
  return res;
}

async function networkFirst(request, cacheName, fallback) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res.ok) await cache.put(request, res.clone());
    return res;
  } catch (error) {
    const hit = await cache.match(request);
    if (hit) return hit;
    if (fallback) return fallback(request, cache);
    throw error;
  }
}

const offlinePage = async (request) => {
  if (request.mode !== "navigate") return Response.error();
  return new Response(OFFLINE_HTML, {
    status: 503,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
};

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/")) return;
  if (request.mode === "navigate" && url.origin === self.location.origin) {
    event.respondWith(networkFirst(request, PAGES, offlinePage));
    return;
  }
  if (isStatic(url) && url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request, STATIC));
    return;
  }
  if (isContent(url) || url.pathname.endsWith("/manifest.json")) {
    const hashed = /\.[0-9a-f]{6}\.json$/.test(url.pathname);
    event.respondWith(hashed ? cacheFirst(request, CONTENT) : networkFirst(request, CONTENT, null));
  }
});

/** Scripts, styles and fonts a page needs, read from its HTML. */
const assetsOf = (html) => [...new Set(html.match(/\/_next\/static\/[^"'\\\s)]+/g) ?? [])];

async function warm(extraRoutes) {
  const pages = await caches.open(PAGES);
  const statics = await caches.open(STATIC);
  for (const route of [...WARM_ROUTES, ...extraRoutes]) {
    try {
      const res = await fetch(route, { credentials: "same-origin" });
      if (!res.ok) continue;
      await pages.put(route, res.clone());
      for (const asset of assetsOf(await res.text()))
        if (!(await statics.match(asset))) {
          const a = await fetch(asset);
          if (a.ok) await statics.put(asset, a);
        }
    } catch {
      /* offline or a route that failed: warm what we can */
    }
  }
  try {
    const content = await caches.open(CONTENT);
    const mres = await fetch("/content/manifest.json");
    if (!mres.ok) return;
    await content.put("/content/manifest.json", mres.clone());
    const manifest = await mres.json();
    const current = manifest.versions?.[manifest.current]?.packs ?? {};
    for (const entry of Object.values(current)) {
      const href = new URL(entry.url, self.location.origin).href;
      if (SKIP_WARM.test(href) || (await content.match(href))) continue;
      const p = await fetch(href);
      if (p.ok) await content.put(href, p);
    }
  } catch {
    /* packs also load on demand and are kept in IndexedDB */
  }
}

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "warm") {
    const extra = Array.isArray(event.data.routes)
      ? event.data.routes.filter((r) => typeof r === "string" && r.startsWith("/play/"))
      : [];
    event.waitUntil(warm(extra));
  }
});
