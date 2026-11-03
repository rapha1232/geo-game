"use client";

import { useEffect } from "react";

const MAX_TILT = 7;

/**
 * Pointer effects for the whole app, from one delegated listener:
 * - card spotlight: writes the pointer position inside the hovered `[data-fx-card]` into `--mx` / `--my`;
 * - 3D tilt: writes `--rx` / `--ry` on the hovered `[data-tilt]` and resets them when the pointer leaves.
 * Mouse only (touch never tilts), and the tilt is skipped when motion is reduced.
 */
export function PointerFX() {
  useEffect(() => {
    let frame = 0;
    let last: PointerEvent | null = null;
    let tilted: HTMLElement | null = null;
    const reduced = () =>
      document.documentElement.dataset.motion === "reduce" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const release = () => {
      if (!tilted) return;
      tilted.style.setProperty("--rx", "0deg");
      tilted.style.setProperty("--ry", "0deg");
      tilted.removeAttribute("data-tilting");
      tilted = null;
    };
    const apply = () => {
      frame = 0;
      const e = last;
      if (!e || !(e.target instanceof Element)) return;
      const card = e.target.closest<HTMLElement>("[data-fx-card]");
      if (card) {
        const r = card.getBoundingClientRect();
        card.style.setProperty("--mx", `${e.clientX - r.left}px`);
        card.style.setProperty("--my", `${e.clientY - r.top}px`);
      }
      const tilt = reduced() ? null : e.target.closest<HTMLElement>("[data-tilt]");
      if (tilt !== tilted) release();
      if (!tilt) return;
      tilted = tilt;
      const r = tilt.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      tilt.setAttribute("data-tilting", "");
      tilt.style.setProperty("--rx", `${(-y * MAX_TILT).toFixed(2)}deg`);
      tilt.style.setProperty("--ry", `${(x * MAX_TILT).toFixed(2)}deg`);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      last = e;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const onLeave = () => release();
    document.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return null;
}
