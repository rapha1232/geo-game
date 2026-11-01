/**
 * Short interface sounds, synthesised with Web Audio (no audio files, nothing to license). Off by default: they play
 * only while Settings → Sounds is on, which `applySettings` mirrors as `data-sounds="on"` on <html>, so a cue never
 * waits on storage. Never throws: no Web Audio, a blocked context or an old browser simply stays silent.
 */
export type CueKind = "correct" | "wrong" | "complete";

type Tone = { freq: number; at: number; dur: number; type: OscillatorType; gain: number };

/** Each cue is a few soft tones: a rising pair for correct, a low dip for wrong, a short arpeggio for a finished round. */
export const TONES: Record<CueKind, readonly Tone[]> = {
  correct: [
    { freq: 660, at: 0, dur: 0.09, type: "sine", gain: 0.07 },
    { freq: 880, at: 0.07, dur: 0.12, type: "sine", gain: 0.07 },
  ],
  wrong: [
    { freq: 220, at: 0, dur: 0.1, type: "triangle", gain: 0.06 },
    { freq: 185, at: 0.08, dur: 0.14, type: "triangle", gain: 0.06 },
  ],
  complete: [
    { freq: 523.25, at: 0, dur: 0.12, type: "sine", gain: 0.06 },
    { freq: 659.25, at: 0.1, dur: 0.12, type: "sine", gain: 0.06 },
    { freq: 783.99, at: 0.2, dur: 0.22, type: "sine", gain: 0.06 },
  ],
};

let ctx: AudioContext | null = null;

export const soundsOn = (root: HTMLElement | undefined = globalThis.document?.documentElement) =>
  root?.getAttribute("data-sounds") === "on";

export function cue(kind: CueKind): void {
  if (!soundsOn()) return;
  try {
    const Ctx =
      globalThis.AudioContext ??
      (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    ctx ??= new Ctx();
    if (ctx.state === "suspended") void ctx.resume();
    const t0 = ctx.currentTime + 0.01;
    for (const tone of TONES[kind]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = tone.type;
      osc.frequency.value = tone.freq;
      // A quick attack and an exponential release, so tones never click.
      gain.gain.setValueAtTime(0.0001, t0 + tone.at);
      gain.gain.exponentialRampToValueAtTime(tone.gain, t0 + tone.at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + tone.at + tone.dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + tone.at);
      osc.stop(t0 + tone.at + tone.dur + 0.02);
    }
  } catch {
    /* silent */
  }
}

/**
 * The cue for one quiz step: one more correct item → correct, one more missed item → wrong. A give-up or time-out
 * that settles many items at once plays nothing here (the finished round has its own cue).
 */
export function quizStepCue(
  prev: readonly { status: string }[] | undefined,
  next: readonly { status: string }[],
): CueKind | null {
  if (!prev) return null;
  const count = (items: readonly { status: string }[], s: string) =>
    items.reduce((n, i) => n + (i.status === s ? 1 : 0), 0);
  const correct = count(next, "correct") - count(prev, "correct");
  const missed = count(next, "missed") - count(prev, "missed");
  if (correct === 1 && missed === 0) return "correct";
  if (missed === 1 && correct === 0) return "wrong";
  return null;
}

/** The cue for one Silhouette guess: solved → correct, any other new guess in the same round → wrong. */
export function guessStepCue(
  prev: { targetId: string; guesses: readonly unknown[] } | undefined,
  next: { targetId: string; guesses: readonly unknown[]; status: string },
): CueKind | null {
  if (!prev || prev.targetId !== next.targetId || next.guesses.length !== prev.guesses.length + 1)
    return null;
  return next.status === "solved" ? "correct" : "wrong";
}
