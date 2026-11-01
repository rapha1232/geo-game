// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cue, guessStepCue, quizStepCue, soundsOn, TONES } from "../lib/sound/cue";
import { DEFAULT_SETTINGS, applySettings, sanitize } from "../lib/settings/settings";

afterEach(() => {
  document.documentElement.removeAttribute("data-sounds");
  vi.unstubAllGlobals();
});

describe("sounds (UX_AND_DESIGN §3.6)", () => {
  it("are off by default, and the setting is mirrored on <html>", () => {
    expect(DEFAULT_SETTINGS.sounds).toBe(false);
    expect(sanitize({ sounds: "yes" }).sounds).toBe(false);
    expect(sanitize({ sounds: true }).sounds).toBe(true);
    applySettings({ ...DEFAULT_SETTINGS, sounds: true });
    expect(soundsOn()).toBe(true);
    applySettings(DEFAULT_SETTINGS);
    expect(soundsOn()).toBe(false);
  });
  it("never creates an audio context while off, and never throws without Web Audio", () => {
    const ctor = vi.fn();
    vi.stubGlobal("AudioContext", ctor);
    cue("correct");
    expect(ctor).not.toHaveBeenCalled();
    vi.stubGlobal("AudioContext", undefined);
    document.documentElement.setAttribute("data-sounds", "on");
    expect(() => cue("wrong")).not.toThrow();
  });
  it("every cue is short and quiet", () => {
    for (const tones of Object.values(TONES))
      for (const tone of tones) {
        expect(tone.at + tone.dur).toBeLessThanOrEqual(0.5);
        expect(tone.gain).toBeLessThanOrEqual(0.1);
      }
  });
  it("a quiz step cues one new correct or missed item, and nothing for a bulk change", () => {
    const s = (...xs: string[]) => xs.map((status) => ({ status }));
    expect(quizStepCue(s("pending", "pending"), s("correct", "pending"))).toBe("correct");
    expect(quizStepCue(s("pending", "pending"), s("missed", "pending"))).toBe("wrong");
    expect(quizStepCue(s("pending", "pending"), s("missed", "missed"))).toBeNull();
    expect(quizStepCue(undefined, s("correct"))).toBeNull();
  });
  it("a Silhouette guess cues correct when it solves the round, wrong otherwise", () => {
    const r = (n: number, status = "guessing", targetId = "a") => ({
      targetId,
      status,
      guesses: Array.from({ length: n }),
    });
    expect(guessStepCue(r(0), r(1))).toBe("wrong");
    expect(guessStepCue(r(1), r(2, "solved"))).toBe("correct");
    expect(guessStepCue(r(2), r(2))).toBeNull();
    expect(guessStepCue(r(2, "solved", "a"), r(0, "guessing", "b"))).toBeNull();
  });
});
