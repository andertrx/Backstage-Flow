import { useEffect, useRef, useState } from "react";

/** Só anima para quem não pediu "reduzir movimento" e fora de navegador automatizado (os testes leem o número na hora). */
function canAnimate(): boolean {
  if (typeof window === "undefined") return false;
  if (navigator.webdriver) return false;
  return !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** Número que "conta" do valor anterior (ou de zero, na primeira vez) até o valor novo. O valor final é sempre o real. */
export function useCountUp(target: number | null, duration = 700): number | null {
  const [shown, setShown] = useState<number | null>(target);
  const from = useRef<number>(0);
  const first = useRef(true);
  useEffect(() => {
    if (target == null || !canAnimate()) {
      setShown(target);
      first.current = false;
      return;
    }
    const start = performance.now();
    const origin = first.current ? 0 : (from.current ?? 0);
    first.current = false;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = origin + (target - origin) * eased;
      from.current = v;
      setShown(p < 1 ? v : target);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return shown;
}
