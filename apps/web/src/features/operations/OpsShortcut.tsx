import { opsCan } from "@backstage/shared";
import { ArrowRight, Briefcase } from "lucide-react";
import { Link } from "react-router";
import { cn } from "@/lib/cn.ts";
import { useMyOpsPermissions } from "./api.ts";
import { useMySummary } from "./notificationsApi.ts";

/**
 * Atalho da Central no dashboard geral (36.7). Só aparece para quem está na
 * Central. Usa a mesma consulta do sino (uma chamada só para os dois).
 */
export function OpsShortcut() {
  const perms = useMyOpsPermissions();
  const inOps = opsCan(perms.data, "ops.access");
  const summary = useMySummary(inOps);
  const s = summary.data;
  if (!inOps || !s) return null;
  const item = (n: number, one: string, many: string, alert = false) => (
    <span className={cn("whitespace-nowrap", alert && n > 0 ? "font-semibold text-red-600" : "text-slate-600")}>
      <b className="tabular-nums">{n.toLocaleString("pt-BR")}</b> {n === 1 ? one : many}
    </span>
  );
  const target = opsCan(perms.data, "ops.dashboard.view") ? "/operacoes/painel" : "/operacoes/minhas-tarefas";
  return (
    <Link to={target} data-testid="ops-shortcut"
      className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-white px-4 py-3 text-sm shadow-sm ring-1 ring-slate-200 transition hover:ring-blue-400">
      <span className="flex items-center gap-2 font-semibold text-slate-800">
        <Briefcase className="size-4 text-blue-600" aria-hidden /> Central de Operações
      </span>
      {item(s.abertas, "tarefa minha em aberto", "tarefas minhas em aberto")}
      {item(s.atrasadas, "atrasada", "atrasadas", true)}
      {item(s.hoje, "vence hoje", "vencem hoje")}
      {item(s.reunioes_hoje, "reunião hoje", "reuniões hoje")}
      {item(s.unread, "notificação nova", "notificações novas")}
      <ArrowRight className="ml-auto size-4 text-blue-600" aria-hidden />
    </Link>
  );
}
