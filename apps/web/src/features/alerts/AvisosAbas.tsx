import { CheckCheck } from "lucide-react";
import { useNavigate } from "react-router";
import { Alert } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { type MonitorNotification, useMarkMonitorRead, useMonitorNotifications } from "@/features/monitoring/notifyApi.ts";
import { NotificationItem } from "@/features/operations/NotificationBell.tsx";
import { type OpsNotification, useMarkNotificationsRead, useNotifications } from "@/features/operations/notificationsApi.ts";
import { cn } from "@/lib/cn.ts";
import { errorMessage } from "@/lib/errors.ts";
import { formatRelative } from "@/lib/format.ts";

/** Aba "Campanhas" de Alertas (43.5): os avisos do Monitoramento, os mesmos do sino de Campanhas. */
export function AvisosCampanhas() {
  const navigate = useNavigate();
  const list = useMonitorNotifications(200);
  const mark = useMarkMonitorRead();
  const items = list.data?.items ?? [];
  const unread = list.data?.unread ?? 0;
  function open(n: MonitorNotification) {
    if (!n.read_at) mark.mutate([n.id]);
    navigate(n.link);
  }
  return (
    <div className="space-y-3" data-testid="avisos-campanhas">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">{unread ? `${unread} não lido(s)` : "Tudo lido."} Quem decide o que chega aqui é o Monitoramento (Configurações → Minhas notificações).</p>
        {unread > 0 && <Button variant="secondary" onClick={() => mark.mutate(null)}><CheckCheck className="size-4" aria-hidden /> Marcar todos como lidos</Button>}
      </div>
      {list.error && <Alert tone="error">{errorMessage(list.error)}</Alert>}
      <Card className="divide-y divide-slate-100 overflow-hidden">
        {list.isLoading && <p className="px-4 py-6 text-sm text-slate-500">Carregando…</p>}
        {!list.isLoading && items.length === 0 && <p className="px-4 py-10 text-center text-sm text-slate-500">Nenhum aviso de campanha por aqui.</p>}
        {items.map((n) => (
          <button key={n.id} type="button" onClick={() => open(n)} data-testid="monitor-notification-row" data-read={n.read_at ? "sim" : "nao"}
            className={cn("flex w-full gap-2.5 px-4 py-3 text-left hover:bg-slate-50", !n.read_at && "bg-blue-50/60")}>
            <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-blue-600")} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className={cn("block text-sm", n.read_at ? "text-slate-700" : "font-semibold text-slate-900")}>{n.title}</span>
              {n.body && <span className="block text-xs text-slate-500">{n.body}</span>}
              <span className="block text-[11px] text-slate-400">{formatRelative(n.created_at)}</span>
            </span>
          </button>
        ))}
      </Card>
    </div>
  );
}

const ATRASADA = "tarefa.atrasada";

/** Aba "Tarefas" de Alertas (43.5): tudo da Central, com as tarefas atrasadas em destaque no topo. */
export function AvisosTarefas() {
  const navigate = useNavigate();
  const list = useNotifications({ limit: 200 });
  const mark = useMarkNotificationsRead();
  const items = list.data?.items ?? [];
  const atrasadas = items.filter((n) => n.kind === ATRASADA && !n.read_at);
  const outras = items.filter((n) => !(n.kind === ATRASADA && !n.read_at));
  const unread = list.data?.unread ?? 0;
  function open(n: OpsNotification) {
    if (!n.read_at) mark.mutate([n.id]);
    if (n.link) navigate(n.link);
  }
  return (
    <div className="space-y-3" data-testid="avisos-tarefas">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">{unread ? `${unread} não lida(s)` : "Tudo lido."} Preferências e aviso no aparelho: Central → aba Notificações.</p>
        {unread > 0 && <Button variant="secondary" onClick={() => mark.mutate(null)}><CheckCheck className="size-4" aria-hidden /> Marcar todas como lidas</Button>}
      </div>
      {list.error && <Alert tone="error">{errorMessage(list.error)}</Alert>}
      {atrasadas.length > 0 && (
        <Card className="overflow-hidden border-l-4 border-l-red-500" data-testid="tarefas-atrasadas">
          <p className="border-b border-slate-100 px-4 py-2 text-sm font-semibold text-red-700">Tarefas atrasadas ({atrasadas.length})</p>
          <div className="divide-y divide-slate-100">{atrasadas.map((n) => <NotificationItem key={n.id} n={n} onOpen={open} />)}</div>
        </Card>
      )}
      <Card className="divide-y divide-slate-100 overflow-hidden">
        {list.isLoading && <p className="px-4 py-6 text-sm text-slate-500">Carregando…</p>}
        {!list.isLoading && outras.length === 0 && atrasadas.length === 0 && <p className="px-4 py-10 text-center text-sm text-slate-500">Nenhuma notificação da Central por aqui.</p>}
        {outras.map((n) => <NotificationItem key={n.id} n={n} onOpen={open} />)}
      </Card>
    </div>
  );
}
