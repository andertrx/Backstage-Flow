import { useEffect, useRef, useState } from "react";
import { NavLink } from "react-router";
import { cn } from "@/lib/cn.ts";

/** Abas de página (Configurações, Criar). No celular, se houver mais abas à direita, a ponta direita esvanece: é a pista de que dá para deslizar. */
export function ScrollTabs({ label, tabs }: { label: string; tabs: { to: string; label: string }[] }) {
  const ref = useRef<HTMLElement>(null);
  const [mais, setMais] = useState(false);
  const atualizar = () => {
    const el = ref.current;
    if (el) setMais(el.scrollWidth - el.scrollLeft - el.clientWidth > 4);
  };
  useEffect(() => {
    atualizar();
    window.addEventListener("resize", atualizar);
    return () => window.removeEventListener("resize", atualizar);
  }, [tabs.length]);
  return (
    <nav ref={ref} onScroll={atualizar} aria-label={label}
      className={cn("flex gap-1 overflow-x-auto border-b border-slate-200", mais && "[mask-image:linear-gradient(to_right,black_85%,transparent)]")}>
      {tabs.map((tab) => (
        <NavLink key={tab.to} to={tab.to}
          className={({ isActive }) =>
            cn("-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium",
              isActive ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800")}>
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
