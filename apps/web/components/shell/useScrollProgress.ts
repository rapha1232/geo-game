"use client";

import { useEffect, type RefObject } from "react";

/**
 * Scroll-linked scenes. Writes `--p` (0..1) on the element: 0 when its top reaches the top of the viewport, 1 when
 * its bottom reaches the bottom (the span a sticky child stays pinned). CSS turns `--p` into movement, only inside
 * `prefers-reduced-motion: no-preference`. Writes through the CSSOM, which the CSP allows (unlike style attributes).
 */
export function useScrollProgress(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    let visible = false;
    const update = () => {
      frame = 0;
      const r = el.getBoundingClientRect();
      const span = r.height - window.innerHeight;
      const p = span > 0 ? Math.min(1, Math.max(0, -r.top / span)) : r.top < 0 ? 1 : 0;
      el.style.setProperty("--p", p.toFixed(4));
    };
    const onScroll = () => {
      if (visible && !frame) frame = requestAnimationFrame(update);
    };
    // Without IntersectionObserver (old browsers, tests) the scene simply always listens.
    const io =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(([e]) => {
            visible = !!e?.isIntersecting;
            if (visible) onScroll();
          });
    if (io) io.observe(el);
    else visible = true;
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      io?.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [ref]);
}
