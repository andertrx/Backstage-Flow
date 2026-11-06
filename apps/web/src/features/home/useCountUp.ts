import { useEffect, useState } from "react";

const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Número que sobe até o valor (600 ms). Quem usa "reduzir movimento" vê o valor direto. */
export function useCountUp(target: number, ms = 600): number {
  const [value, setValue] = useState(() => (reduced() ? target : 0));
  useEffect(() => {
    if (reduced() || target === 0) { setValue(target); return; }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      setValue(Math.round(target * (1 - (1 - t) ** 3)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}
