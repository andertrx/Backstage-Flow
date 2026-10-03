import { BellRing } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { cn } from "@/lib/cn.ts";
import { formatRelative } from "@/lib/format.ts";
import { type MonitorNotification, useMarkMonitorRead, useMonitorNotifications } from "./notifyApi.ts";

/**
 * Ícone de avisos do Monitoramento no topo (Etapa 37.5). É separado do sino da Central de Operações
 * para os dois módulos continuarem independentes: cada um tem os seus avisos.
 */
export function MonitorBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const list = useMonitorNotifications(15);
  const mark = useMarkMonitorRead();
  const count = list.data?.unread ?? 0;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  function openItem(n: MonitorNotification) {
    if (!n.read_at) mark.mutate([n.id]);
    setOpen(false);
    navigate(n.link);
  }

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} data-testid="monitor-bell"
        aria-label={count ? `Avisos do monitoramento (${count} não lidos)` : "Avisos do monitoramento"} title="Avisos do monitoramento"
        className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900">
        <BellRing className="size-5" aria-hidden />
        {count > 0 && (
          <span className="absolute right-0.5 top-0.5 grid min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-4 text-white" data-testid="monitor-bell-count">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-50 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-slate-200"
          role="dialog" aria-label="Avisos do monitoramento" data-testid="monitor-bell-panel">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
            <p className="text-sm font-semibold text-slate-900">Avisos do monitoramento</p>
            {count > 0 && (
              <button type="button" className="text-xs font-medium text-blue-700 hover:underline" onClick={() => mark.mutate(null)} data-testid="monitor-bell-read-all">
                Marcar todos como lidos
              </button>
            )}
          </div>
          <div className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
            {list.isLoading && <p className="px-3 py-4 text-sm text-slate-500">Carregando…</p>}
            {list.error && <p className="px-3 py-4 text-sm text-red-700">Não conseguimos carregar os avisos.</p>}
            {list.data && list.data.items.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-slate-500">Nenhum aviso por aqui.</p>
            )}
            {list.data?.items.map((n) => (
              <button key={n.id} type="button" onClick={() => openItem(n)} data-testid="monitor-notification" data-read={n.read_at ? "sim" : "nao"}
                className={cn("flex w-full gap-2.5 px-3 py-2.5 text-left hover:bg-slate-50", !n.read_at && "bg-blue-50/60")}>
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-blue-600")} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-sm", n.read_at ? "text-slate-700" : "font-semibold text-slate-900")}>{n.title}</span>
                  {n.body && <span className="line-clamp-2 block text-xs text-slate-500">{n.body}</span>}
                  <span className="block text-[11px] text-slate-400">{formatRelative(n.created_at)}</span>
                </span>
                {!n.read_at && <span className="sr-only">(não lido)</span>}
              </button>
            ))}
          </div>
          <Link to="/monitoramento?aba=configuracoes#minhas-notificacoes" onClick={() => setOpen(false)}
            className="block border-t border-slate-100 px-3 py-2 text-center text-sm font-medium text-blue-700 hover:bg-slate-50">
            Preferências de aviso
          </Link>
        </div>
      )}
    </div>
  );
}
