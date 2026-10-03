import { OBJECTIVE_GROUP_LABELS, OBJECTIVE_GROUPS, type ObjectiveGroup } from "@backstage/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Target } from "lucide-react";
import { cn } from "@/lib/cn.ts";
import { FriendlyError, friendlyDbError } from "@/lib/errors.ts";
import { supabase } from "@/lib/supabase.ts";

/**
 * Filtro de objetivo do Monitoramento: escolha vários objetivos; a escolha fica salva no banco
 * para a pessoa (volta sozinha em qualquer aparelho até ela mudar). Vale para todas as abas.
 */
const KEY = ["monitoring", "view-prefs"] as const;

export function useMonitorObjectives() {
  const q = useQuery({
    queryKey: KEY,
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("monitor_view_prefs_get");
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar o filtro de objetivo."));
      return ((data as { objectives?: string[] } | null)?.objectives ?? []).filter((o): o is ObjectiveGroup => (OBJECTIVE_GROUPS as readonly string[]).includes(o));
    },
  });
  return { objectives: q.data ?? [], ready: q.isSuccess || q.isError, error: q.error };
}

export function useSaveMonitorObjectives() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: KEY,
    mutationFn: async (objectives: ObjectiveGroup[]) => {
      const { error } = await supabase.rpc("monitor_view_prefs_save", { p_objectives: objectives });
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos salvar o filtro de objetivo."));
    },
    // Mostra na hora; se o banco recusar, volta ao que estava salvo.
    onMutate: async (objectives) => {
      await qc.cancelQueries({ queryKey: KEY });
      const before = qc.getQueryData<ObjectiveGroup[]>(KEY);
      qc.setQueryData(KEY, objectives);
      return { before };
    },
    onError: (_e, _v, ctx) => qc.setQueryData(KEY, ctx?.before ?? []),
    // Cliques seguidos: só relê do banco depois do último (uma releitura atrasada não desfaz o clique seguinte).
    onSettled: () => {
      if (qc.isMutating({ mutationKey: KEY }) <= 1) void qc.invalidateQueries({ queryKey: KEY });
    },
  });
}

/** Barra de objetivos no topo do Monitoramento: nenhum marcado = todos. */
export function ObjectiveFilter() {
  const qc = useQueryClient();
  const { objectives } = useMonitorObjectives();
  const save = useSaveMonitorObjectives();
  // Parte sempre do valor mais recente (inclusive de um clique que ainda está salvando).
  const toggle = (g: ObjectiveGroup) => {
    const current = qc.getQueryData<ObjectiveGroup[]>(KEY) ?? objectives;
    save.mutate(current.includes(g) ? current.filter((o) => o !== g) : OBJECTIVE_GROUPS.filter((o) => o === g || current.includes(o)));
  };
  const chip = (active: boolean) =>
    cn("rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition",
      active ? "bg-blue-600 text-white ring-blue-600" : "bg-white text-slate-600 ring-slate-200 hover:text-blue-700 hover:ring-blue-400");
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Objetivo da campanha" data-testid="filtro-objetivo">
      <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
        <Target className="size-4 text-blue-600" aria-hidden /> Objetivo:
      </span>
      <button type="button" aria-pressed={objectives.length === 0} onClick={() => save.mutate([])} className={chip(objectives.length === 0)}>
        Todos
      </button>
      {OBJECTIVE_GROUPS.map((g) => (
        <button key={g} type="button" aria-pressed={objectives.includes(g)} onClick={() => toggle(g)} className={chip(objectives.includes(g))}>
          {OBJECTIVE_GROUP_LABELS[g]}
        </button>
      ))}
      <span className="text-[11px] text-slate-400">Vale para todas as abas e fica salvo para você.</span>
      {save.error && <span className="text-xs text-red-700" role="alert">Não conseguimos salvar o filtro. Tente de novo.</span>}
    </div>
  );
}
