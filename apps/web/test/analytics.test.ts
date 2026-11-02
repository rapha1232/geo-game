// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const posthog = {
  init: vi.fn(),
  capture: vi.fn(),
  opt_out_capturing: vi.fn(),
  opt_in_capturing: vi.fn(),
};
vi.mock("posthog-js/no-external", () => ({ default: posthog }));

const load = async () => {
  vi.resetModules();
  return import("../lib/observability/analytics");
};

beforeEach(() => {
  for (const f of Object.values(posthog)) f.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("usage statistics (privacy policy: cookieless, first-party, optional)", () => {
  it("never loads PostHog without a project key", async () => {
    const a = await load();
    a.setAnalyticsEnabled(true);
    a.track("report_sent", { category: "name" });
    await new Promise((r) => setTimeout(r, 0));
    expect(posthog.init).not.toHaveBeenCalled();
  });

  it("initialises cookieless, through our own origin, with no autocapture or recording", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
    const a = await load();
    a.setAnalyticsEnabled(true);
    await vi.waitFor(() => expect(posthog.init).toHaveBeenCalledOnce());
    const [key, cfg] = posthog.init.mock.calls[0]!;
    expect(key).toBe("phc_test");
    expect(cfg).toMatchObject({
      api_host: "/ingest",
      cookieless_mode: "always",
      persistence: "memory",
      disable_external_dependency_loading: true,
      autocapture: false,
      disable_session_recording: true,
      disable_surveys: true,
    });
  });

  it("queues events until the SDK is ready, then sends them in order", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
    const a = await load();
    a.setAnalyticsEnabled(true);
    a.track("challenge_created", { game: "silhouette" });
    a.track("report_sent", { category: "name" });
    await vi.waitFor(() => expect(posthog.capture).toHaveBeenCalledTimes(2));
    expect(posthog.capture.mock.calls.map((c) => c[0])).toEqual([
      "challenge_created",
      "report_sent",
    ]);
  });

  it("the Settings switch and the Global Privacy Control signal turn it off", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
    let a = await load();
    a.setAnalyticsEnabled(false);
    a.track("report_sent", { category: "name" });
    await new Promise((r) => setTimeout(r, 0));
    expect(posthog.init).not.toHaveBeenCalled();
    expect(posthog.capture).not.toHaveBeenCalled();

    vi.stubGlobal("navigator", { ...navigator, globalPrivacyControl: true });
    a = await load();
    expect(a.gpcOn()).toBe(true);
    a.setAnalyticsEnabled(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(posthog.init).not.toHaveBeenCalled();
  });

  it("turning it off after it started opts out and stops sending", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
    const a = await load();
    a.setAnalyticsEnabled(true);
    await vi.waitFor(() => expect(posthog.init).toHaveBeenCalled());
    a.setAnalyticsEnabled(false);
    expect(posthog.opt_out_capturing).toHaveBeenCalled();
    a.track("report_sent", { category: "name" });
    expect(posthog.capture).not.toHaveBeenCalled();
  });

  it("scores travel as 10-point bands, never exact", async () => {
    const { scoreBand } = await load();
    expect(scoreBand(87, 100)).toBe("80%");
    expect(scoreBand(5, 5)).toBe("100%");
    expect(scoreBand(0, 0)).toBe("n/a");
  });
});
