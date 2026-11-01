"use client";

import { useEffect } from "react";

/**
 * Feeds the card spotlight: one delegated pointer listener writes the pointer position (relative to the hovered
 * card) into `--mx` / `--my`. Purely visual; does nothing for touch or when no card is under the pointer.
 */
export function PointerFX() {
  useEffect(() => {
    let frame = 0;
    let last: PointerEvent | null = null;
    const apply = () => {
      frame = 0;
      const e = last;
      if (!e || !(e.target instanceof Element)) return;
      const card = e.target.closest<HTMLElement>("[data-fx-card]");
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${e.clientX - r.left}px`);
      card.style.setProperty("--my", `${e.clientY - r.top}px`);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      last = e;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    document.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      document.removeEventListener("pointermove", onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return null;
}
