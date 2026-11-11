import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FriendlyError } from "@/lib/errors.ts";
import { supabase } from "@/lib/supabase.ts";
import { ownDbError } from "./api.ts";

/**
 * Configurações da Central: excluir uma opção que ninguém usa e ordenar arrastando (só administrador, o banco confere).
 * Excluir só funciona para o que NÃO está em uso; o que as regras do sistema usam só pode ser desativado.
 */
export type ConfigOptionKind =
  | "status" | "client_stage" | "queue_column" | "lead_stage" | "loss_reason" | "meeting_category" | "activity_type" | "onboarding_template" | "sector";

/** Opções que as regras do sistema usam por nome: não têm o botão Excluir (o banco recusa também). */
export const PROTECTED_OPTIONS: Partial<Record<ConfigOptionKind, string[]>> = {
  status: ["nao_iniciado", "aguardando_cliente", "aguardando_interno", "em_andamento", "finalizado", "cancelado", "bloqueado"],
  client_stage: ["onboarding_pendente", "coleta_acessos", "briefing", "configuracao_inicial", "concluido", "contrato_pago"],
  lead_stage: ["perdido", "contrato_pago", "reuniao_agendada", "reuniao_realizada"],
  loss_reason: ["outros"],
  meeting_category: ["daily"],
};
export const isProtectedOption = (kind: ConfigOptionKind, id: string) => (PROTECTED_OPTIONS[kind] ?? []).includes(id);

/** Ativas primeiro (na ordem em que estão), desativadas por último. */
export function splitActive<T extends { id: string }>(list: T[], isActive: (x: T) => boolean): { active: T[]; inactive: T[] } {
  return { active: list.filter(isActive), inactive: list.filter((x) => !isActive(x)) };
}

export function useConfigExcluir(kind: ConfigOptionKind) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("ops_config_excluir", { p_tipo: kind, p_id: id });
      if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos excluir esta opção."));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ops"] }),
  });
}

/** Ordem de opções que ainda não tinham função própria (tipos de atividade, motivos de perda, tipos de reunião). */
export function useConfigReordenar(kind: "activity_type" | "loss_reason" | "meeting_category") {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.rpc("ops_config_reordenar", { p_tipo: kind, p_ids: ids });
      if (error) throw new FriendlyError(ownDbError(error, "Não conseguimos mudar a ordem."));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ops"] }),
  });
}
