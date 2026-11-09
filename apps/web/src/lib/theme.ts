import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

const KEY = "bf-theme";
const listeners = new Set<() => void>();

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // armazenamento bloqueado: só não lembra a escolha
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#0b0b0d" : "#1d4ed8");
  listeners.forEach((l) => l());
}

type ViewDoc = Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } };

/**
 * Troca o tema. Nos navegadores com "View Transitions", a cor nova se espalha em círculo a partir do botão
 * (a mesma ideia da troca "líquida" do layout de referência). Sem isso, ou com "reduzir movimento", troca na hora.
 */
export function setTheme(theme: Theme, origin?: { x: number; y: number }) {
  const doc = document as ViewDoc;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (!doc.startViewTransition || reduce || !origin) return apply(theme);
  const { x, y } = origin;
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  const t = doc.startViewTransition(() => apply(theme));
  t.ready
    .then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 650, easing: "cubic-bezier(0.22, 1, 0.36, 1)", pseudoElement: "::view-transition-new(root)" },
      );
    })
    .catch(() => {});
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    currentTheme,
    () => "light",
  );
}
