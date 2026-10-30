import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCsp, newNonce } from "../lib/security/csp";
import { RATE_LIMITS } from "../lib/api/rate-limits";
import { themeInitScript } from "@meridian/ui";

const directive = (csp: string, name: string): string[] =>
  (csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "").split(" ").slice(1);

describe("AC-PL-025 Content-Security-Policy", () => {
  const nonce = newNonce();
  const csp = buildCsp({ nonce, contentHost: "https://abc.public.blob.vercel-storage.com" });

  it("matches ARCHITECTURE §12", () => {
    expect(directive(csp, "default-src")).toEqual(["'self'"]);
    expect(directive(csp, "frame-ancestors")).toEqual(["'none'"]);
    expect(directive(csp, "style-src")).toEqual(["'self'", `'nonce-${nonce}'`]);
    expect(directive(csp, "img-src")).toEqual([
      "'self'",
      "data:",
      "https://abc.public.blob.vercel-storage.com",
    ]);
    expect(directive(csp, "connect-src")).toContain("https://abc.public.blob.vercel-storage.com");
    expect(directive(csp, "object-src")).toEqual(["'none'"]);
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("scripts need the nonce: no unsafe-inline and no unsafe-eval in production", () => {
    const script = directive(csp, "script-src");
    expect(script).toContain(`'nonce-${nonce}'`);
    expect(script).not.toContain("'unsafe-inline'");
    expect(script).not.toContain("'unsafe-eval'");
    expect(directive(csp, "style-src")).not.toContain("'unsafe-inline'");
  });

  it('React Aria can find the nonce: the layout emits <meta name="csp-nonce">', () => {
    const layout = readFileSync(resolve(process.cwd(), "app/layout.tsx"), "utf8");
    expect(layout).toContain('<meta name="csp-nonce" content={nonce} />');
  });

  it("inline styles are allowed only as attributes", () => {
    expect(directive(csp, "style-src-attr")).toEqual(["'unsafe-inline'"]);
  });

  it("development allows eval and websockets but production never does", () => {
    const dev = buildCsp({ nonce, dev: true });
    expect(directive(dev, "script-src")).toContain("'unsafe-eval'");
    expect(dev).not.toContain("upgrade-insecure-requests");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toContain("ws:");
  });

  it("nonces are unique, unguessable-length and CSP-safe base64", () => {
    const seen = new Set(Array.from({ length: 200 }, () => newNonce()));
    expect(seen.size).toBe(200);
    for (const n of seen) expect(n).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });

  it("falls back to self when no content host is configured, and accepts extra origins", () => {
    const c = buildCsp({
      nonce,
      extraConnect: ["https://vitals.vercel-insights.com"],
      extraScript: ["https://va.vercel-scripts.com"],
    });
    expect(directive(c, "img-src")).toEqual(["'self'", "data:"]);
    expect(directive(c, "connect-src")).toContain("https://vitals.vercel-insights.com");
    expect(directive(c, "script-src")).toContain("https://va.vercel-scripts.com");
  });

  it("the theme init script is the only inline script, and it is plain JS with no template holes", () => {
    expect(themeInitScript).not.toContain("${");
    expect(themeInitScript.startsWith("(function(){")).toBe(true);
  });
});

describe("response headers (next.config.ts)", () => {
  const config = readFileSync(resolve(process.cwd(), "next.config.ts"), "utf8");
  it("sets HSTS exactly as specified, nosniff, frame and referrer policies", () => {
    expect(config).toContain("max-age=63072000; includeSubDomains; preload");
    for (const h of [
      "X-Content-Type-Options",
      "X-Frame-Options",
      "Referrer-Policy",
      "Permissions-Policy",
      "Cross-Origin-Opener-Policy",
    ])
      expect(config).toContain(h);
    expect(config).toContain("poweredByHeader: false");
  });
});

describe("rate limits (ARCHITECTURE §12)", () => {
  const find = (path: string, window: number) =>
    RATE_LIMITS.find((r) => r.path === path && r.windowSeconds === window);
  it("match the spec table", () => {
    expect(find("/api/v1/reports", 60)?.limit).toBe(10);
    expect(find("/api/v1/reports", 86_400)?.limit).toBe(50);
    expect(find("/api/v1/challenges", 60)?.limit).toBe(30);
    expect(find("/api/v1/telemetry", 60)?.limit).toBe(120);
    expect(find("/api/auth", 60)?.limit).toBe(10);
  });
});
