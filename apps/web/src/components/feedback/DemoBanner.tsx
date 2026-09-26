import { FlaskConical, LogOut } from "lucide-react";
import { exitDemo, isDemoMode } from "@/lib/demo.ts";

/**
 * Faixa sempre visível no modo demonstração (Etapa 27): deixa claro que os
 * dados são fictícios e não podem ser confundidos com os reais.
 */
export function DemoBanner() {
  if (!isDemoMode) return null;
  return (
    <div
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-amber-400 px-4 py-1.5 text-center text-xs font-medium text-amber-950 sm:text-sm"
      role="status"
      data-testid="demo-banner"
    >
      <FlaskConical className="size-4 shrink-0" aria-hidden />
      {/* No celular a faixa fica em uma linha: o aviso principal continua sempre visível. */}
      <span>
        <strong className="tracking-wide">MODO DEMONSTRAÇÃO</strong> · Dados fictícios
        <span className="hidden sm:inline">, só para conhecer o sistema. Nada aqui é real e nada é salvo.</span>
      </span>
      <button
        type="button"
        onClick={exitDemo}
        aria-label="Sair da demonstração"
        className="inline-flex items-center gap-1 rounded-md bg-amber-950/10 px-2 py-0.5 font-semibold hover:bg-amber-950/20 focus-visible:outline-2 focus-visible:outline-amber-950"
      >
        <LogOut className="size-3.5" aria-hidden /> Sair<span className="hidden sm:inline"> da demonstração</span>
      </button>
    </div>
  );
}
