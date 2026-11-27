import { useCallback, useEffect, useRef } from "react";

/** Só anima para quem não pediu "reduzir movimento" e fora de navegador automatizado (os testes leem o número na hora). */
function canAnimate(): boolean {
  if (typeof window === "undefined") return false;
  if (navigator.webdriver) return false;
  return !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Número que "conta" do valor anterior (ou de zero, na primeira vez) até o valor novo. O valor final é sempre o real.
 * 27/11/2026: o número é escrito DIRETO no elemento a cada quadro, sem passar pelo estado do React (antes o componente inteiro era
 * redesenhado ~40 vezes por contagem). Uso: `<p ref={useCountUpText(valor, (v) => formatar(v))}>{formatar(valor)}</p>`
 * (o texto escrito no JSX é o valor final, então o React nunca briga com a contagem).
 */
export function useCountUpText<T extends HTMLElement>(target: number | null, format: (v: number) => string, duration = 700) {
  const el = useRef<T | null>(null);
  const from = useRef(0);
  const first = useRef(true);
  const fmt = useRef(format);
  fmt.current = format;
  useEffect(() => {
    const node = el.current;
    if (!node || target == null) return;
    if (!canAnimate()) {
      node.textContent = fmt.current(target);
      from.current = target;
      first.current = false;
      return;
    }
    const start = performance.now();
    const origin = first.current ? 0 : from.current;
    first.current = false;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const v = origin + (target - origin) * (1 - Math.pow(1 - p, 3));
      from.current = v;
      node.textContent = fmt.current(p < 1 ? v : target);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return useCallback((n: T | null) => { el.current = n; }, []);
}
