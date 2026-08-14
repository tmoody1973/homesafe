"use client";

import { useEffect, useRef } from "react";

// The Stat-Led hero's one reveal: the figure ticks from 0 to its real value
// in ~500ms. Reduced-motion users get the final number immediately — the
// data is the point, the tick is garnish.
export function StatCounter({ value }: { readonly value: number }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const started = performance.now();
    const duration = 500;
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / duration);
      const eased = 1 - (1 - progress) ** 3;
      node.textContent = Math.round(value * eased).toLocaleString("en-US");
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <span ref={ref}>{value.toLocaleString("en-US")}</span>;
}
