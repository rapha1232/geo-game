import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(import.meta.dirname, "../public/sw.js"), "utf8");

/** A tiny Cache Storage and network, enough to drive the worker's fetch and message handlers. */
function boot() {
  const stores = new Map<string, Map<string, Response>>();
  const listeners = new Map<string, (e: unknown) => void>();
  let online = true;
  const hits: string[] = [];
  const files: Record<string, { body: string; type?: string }> = {
    "/play": { body: '<script src="/_next/static/chunks/play-abc.js"></script>' },
    "/": { body: '<link href="/_next/static/css/app.css">' },
    "/play/quiz/a-quiz": { body: "quiz" },
    "/_next/static/chunks/play-abc.js": { body: "js" },
    "/_next/static/css/app.css": { body: "css" },
    "/content/manifest.json": {
      body: JSON.stringify({
        current: "1",
        versions: {
          "1": {
            packs: {
              a: { url: "content/1/core.countries.abcdef.json" },
              big: { url: "content/1/geo.world.10m.abcdef.json" },
            },
          },
        },
      }),
    },
    "/content/1/core.countries.abcdef.json": { body: "{}" },
    "/content/1/geo.world.10m.abcdef.json": { body: "{}" },
  };
  const keyOf = (r: Request | string): string => {
    const u = new URL(typeof r === "string" ? r : r.url, "https://app.test");
    return u.pathname + u.search === "" ? u.href : u.href;
  };
  const caches = {
    async open(name: string) {
      const m = stores.get(name) ?? stores.set(name, new Map()).get(name)!;
      return {
        match: async (r: Request | string) => m.get(keyOf(r))?.clone(),
        put: async (r: Request | string, res: Response) => void m.set(keyOf(r), res),
      };
    },
    keys: async () => [...stores.keys()],
    delete: async (n: string) => stores.delete(n),
  };
  const fetchFn = async (r: Request | string) => {
    if (!online) throw new TypeError("offline");
    const u = new URL(typeof r === "string" ? r : r.url, "https://app.test");
    hits.push(u.pathname);
    const f = files[u.pathname];
    return f ? new Response(f.body, { status: 200 }) : new Response("no", { status: 404 });
  };
  const self = {
    location: { origin: "https://app.test" },
    skipWaiting: () => undefined,
    clients: { claim: async () => undefined },
    addEventListener: (type: string, fn: (e: unknown) => void) => listeners.set(type, fn),
  };
  vm.runInNewContext(source, {
    self,
    caches,
    fetch: fetchFn,
    Response,
    URL,
    Request,
    Promise,
    Set,
    RegExp,
  });
  const respond = async (request: Request): Promise<Response | null> => {
    let out: Promise<Response> | null = null;
    listeners.get("fetch")!({ request, respondWith: (p: Promise<Response>) => (out = p) });
    return out ? await out : null;
  };
  const warm = async (routes: string[] = []) => {
    let done: Promise<unknown> = Promise.resolve();
    listeners.get("message")!({
      data: { type: "warm", routes },
      waitUntil: (p: Promise<unknown>) => (done = p),
    });
    await done;
  };
  const nav = (path: string) => {
    const req = new Request(`https://app.test${path}`);
    Object.defineProperty(req, "mode", { value: "navigate" });
    return req;
  };
  return { respond, warm, nav, setOnline: (v: boolean) => (online = v), hits, stores };
}

describe("service worker", () => {
  it("AC-PL-030 after one online visit a page still opens with the network gone", async () => {
    const sw = boot();
    const first = await sw.respond(sw.nav("/play"));
    expect(await first!.text()).toContain("play-abc.js");
    sw.setOnline(false);
    const again = await sw.respond(sw.nav("/play"));
    expect(again!.status).toBe(200);
    expect(await again!.text()).toContain("play-abc.js");
  });

  it("shows a small offline page for a page never visited", async () => {
    const sw = boot();
    sw.setOnline(false);
    const res = await sw.respond(sw.nav("/play/unseen"));
    expect(res!.status).toBe(503);
    expect(await res!.text()).toContain("You're offline");
  });

  it("warms the game routes, their scripts and the R1 packs, but not the 10 m map", async () => {
    const sw = boot();
    await sw.warm();
    sw.setOnline(false);
    expect((await sw.respond(sw.nav("/play")))!.status).toBe(200);
    expect(
      await (await sw.respond(
        new Request("https://app.test/_next/static/chunks/play-abc.js"),
      ))!.text(),
    ).toBe("js");
    expect(
      await (await sw.respond(
        new Request("https://app.test/content/1/core.countries.abcdef.json"),
      ))!.text(),
    ).toBe("{}");
    expect(sw.hits).not.toContain("/content/1/geo.world.10m.abcdef.json");
  });

  it("warms extra game routes the page names, and only under /play/", async () => {
    const sw = boot();
    await sw.warm(["/play/quiz/a-quiz", "/admin"]);
    sw.setOnline(false);
    expect(await (await sw.respond(sw.nav("/play/quiz/a-quiz")))!.text()).toBe("quiz");
    expect(sw.hits).not.toContain("/admin");
  });

  it("serves hashed static files and packs from cache without asking the network again", async () => {
    const sw = boot();
    await sw.respond(new Request("https://app.test/_next/static/chunks/play-abc.js"));
    await sw.respond(new Request("https://app.test/_next/static/chunks/play-abc.js"));
    expect(sw.hits.filter((h) => h.endsWith("play-abc.js"))).toHaveLength(1);
  });

  it("never touches the API or non-GET requests", async () => {
    const sw = boot();
    expect(await sw.respond(new Request("https://app.test/api/v1/health"))).toBeNull();
    expect(await sw.respond(new Request("https://app.test/play", { method: "POST" }))).toBeNull();
  });

  it("keeps the manifest fresh when online and falls back to the last copy offline", async () => {
    const sw = boot();
    await sw.respond(new Request("https://app.test/content/manifest.json"));
    sw.setOnline(false);
    const res = await sw.respond(new Request("https://app.test/content/manifest.json"));
    expect(JSON.parse(await res!.text()).current).toBe("1");
  });
});
