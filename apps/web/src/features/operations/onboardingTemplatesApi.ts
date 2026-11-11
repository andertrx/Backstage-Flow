import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { OpsPriority } from "@backstage/shared";
import { FriendlyError, friendlyDbError } from "@/lib/errors.ts";
import { supabase } from "@/lib/supabase.ts";
import { ownDbError } from "./api.ts";

// ---------------------------------------------------------------------------
// Etapa 50.1 — tarefas padrão do onboarding (cadastro em Configurações; uso no cartão do cliente).
// ---------------------------------------------------------------------------

export interface OpsOnboardingTemplate {
  id: string;
  title: string;
  description: string | null;
  sector_id: string;
  priority: OpsPriority;
  due_days: number | null;
  /** T5.32: títulos das subtarefas oferecidas junto (até 20). */
  subtasks: string[];
  position: number;
  active: boolean;
}

export interface OpsOnboardingTemplateInput {
  title: string;
  description: string;
  sector_id: string;
  priority: OpsPriority;
  due_days: string;
  /** Uma subtarefa por linha. */
  subtasks: string;
}

const KEY = ["ops"] as const;

export function useOnboardingTemplates() {
  return useQuery({
    queryKey: [...KEY, "onboarding-templates"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("ops_onboarding_task_templates")
        .select("id,title,description,sector_id,priority,due_days,subtasks,position,active").order("position");
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar as tarefas padrão."));
      return data as OpsOnboardingTemplate[];
    },
  });
}

function useOpsMutation<T, R = unknown>(fn: (v: T) => Promise<R>) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: fn, onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }) });
}

export function useSaveOnboardingTemplate() {
  return useOpsMutation(async (v: { id: string | null; input: OpsOnboardingTemplateInput }) => {
    const { data, error } = await supabase.rpc("ops_onboarding_template_save", {
      p_id: v.id,
      p: { title: v.input.title.trim(), description: v.input.description.trim(), sector_id: v.input.sector_id, priority: v.input.priority, due_days: v.input.due_days.trim(),
        subtasks: v.input.subtasks.split("\n").map((x) => x.trim()).filter(Boolean) },
    });
    if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos salvar a tarefa padrão."));
    return data as string;
  });
}

export function useSetOnboardingTemplateActive() {
  return useOpsMutation(async (v: { id: string; active: boolean }) => {
    const { error } = await supabase.rpc("ops_onboarding_template_set_active", { p_id: v.id, p_active: v.active });
    if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos mudar a tarefa padrão."));
  });
}

export function useReorderOnboardingTemplates() {
  return useOpsMutation(async (ids: string[]) => {
    const { error } = await supabase.rpc("ops_onboarding_template_reorder", { p_ids: ids });
    if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos reordenar as tarefas padrão."));
  });
}
