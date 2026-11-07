import { ALERT_SEVERITY_EMOJI, ALERT_TYPE_LABELS, compareAlerts } from "@backstage/shared";
import { Wallet } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { formatRelative } from "@/lib/format.ts";
import { useAlerts, useUnseenAlertsCount } from "./api.ts";

/**
 * Sininho "Contas" no topo (43.5): os alertas das contas de anúncio (saldo, pagamento, conta restrita, erro de conexão...).
 * O número é o mesmo do item Alertas do menu. Campanhas e Tarefas têm o seu próprio sininho ao lado.
 */
export function AlertsBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const count = useUnseenAlertsCount(true).data ?? 0;
  const list = useAlerts("abertos");
  const top = [...(list.data ?? [])].filter((a) => a.status === "aberto").sort(compareAlerts).slice(0, 8);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} data-testid="accounts-bell"
        aria-label={count ? `Contas: alertas das contas (${count} não vistos)` : "Contas: alertas das contas"} title="Contas: saldo, pagamento, conta restrita e erros"
        className="relative flex items-center gap-1.5 rounded-lg p-2 text-slate-600 hover:bg-rose-50 hover:text-slate-900">
        <Wallet className="size-5 text-rose-600" aria-hidden />
        <span className="hidden text-xs font-semibold text-slate-700 xl:inline" aria-hidden>Contas</span>
        {count > 0 && (
          <span className="absolute right-0 top-0 grid min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-4 text-white" data-testid="accounts-bell-count">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>
      {open && (
        <div className="fixed inset-x-2 top-[4.5rem] z-50 overflow-hidden rounded-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-11 sm:w-[22rem] bg-white shadow-xl ring-1 ring-slate-200"
          role="dialog" aria-label="Alertas das contas" data-testid="accounts-bell-panel">
          <div className="border-b border-slate-100 px-3 py-2"><p className="text-sm font-semibold text-slate-900">Alertas das contas</p></div>
          <div className="max-h-[min(24rem,calc(100dvh-12rem))] divide-y divide-slate-100 overflow-y-auto">
            {list.isLoading && <p className="px-3 py-4 text-sm text-slate-500">Carregando…</p>}
            {!list.isLoading && top.length === 0 && <p className="px-3 py-6 text-center text-sm text-slate-500">Nenhum alerta novo nas contas.</p>}
            {top.map((a) => (
              <button key={a.id} type="button" onClick={() => { setOpen(false); navigate("/alertas"); }} data-testid="accounts-bell-item"
                className="flex w-full gap-2.5 bg-blue-50/60 px-3 py-2.5 text-left hover:bg-slate-50">
                <span aria-hidden className="mt-0.5">{ALERT_SEVERITY_EMOJI[a.severity]}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-900">{a.clients?.name ?? "—"} · {ALERT_TYPE_LABELS[a.type]}</span>
                  <span className="line-clamp-2 block text-xs text-slate-500">{a.description}</span>
                  <span className="block text-[11px] text-slate-400">{formatRelative(a.first_seen_at)}</span>
                </span>
              </button>
            ))}
          </div>
          <Link to="/alertas" onClick={() => setOpen(false)} className="block border-t border-slate-100 px-3 py-2 text-center text-sm font-medium text-blue-700 hover:bg-slate-50">
            Ver todos em Alertas
          </Link>
        </div>
      )}
    </div>
  );
}
