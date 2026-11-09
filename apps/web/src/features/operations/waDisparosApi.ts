import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FriendlyError, friendlyDbError } from "@/lib/errors.ts";
import { supabase } from "@/lib/supabase.ts";

// Etapa 44.3 — envio semanal pelo WhatsApp conectado (automático e "enviar agora").

export type DisparoStatus = "pendente" | "enviando" | "enviado" | "falhou" | "pulado";
export interface WaDisparo {
  id: number;
  envio_id: string;
  cliente_id: string;
  semana: string;
  origem: "automatico" | "manual";
  status: DisparoStatus;
  tentativas: number;
  detalhe: string | null;
  enviado_em: string | null;
  atualizado_em: string;
}
const KEY = ["wa-disparos"] as const;
const dbError = (e: { code?: string; message: string }, fb: string) => (e.code === "22023" || e.code === "42501" ? e.message : friendlyDbError(e, fb));

/** Quais envios estão no automático (só quem tem a permissão enxerga). */
export function useWaAutomaticos() {
  return useQuery({
    queryKey: [...KEY, "config"],
    queryFn: async () => {
      const { data, error } = await supabase.from("wa_envio_config").select("envio_id,automatico");
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar os envios automáticos."));
      return new Set(((data as { envio_id: string; automatico: boolean }[] | null) ?? []).filter((r) => r.automatico).map((r) => r.envio_id));
    },
  });
}

/** Disparos recentes (últimas 3 semanas), os mais novos primeiro; atualiza sozinho enquanto há fila. */
export function useWaDisparos() {
  return useQuery({
    queryKey: [...KEY, "lista"],
    refetchInterval: (q) => ((q.state.data as WaDisparo[] | undefined) ?? []).some((d) => d.status === "pendente" || d.status === "enviando") ? 15_000 : false,
    queryFn: async () => {
      const { data, error } = await supabase.from("wa_disparos")
        .select("id,envio_id,cliente_id,semana,origem,status,tentativas,detalhe,enviado_em,atualizado_em")
        .order("id", { ascending: false }).limit(300);
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar os disparos."));
      return (data as WaDisparo[] | null) ?? [];
    },
  });
}

export function useSetAutomatico() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { envio: string; on: boolean }) => {
      const { error } = await supabase.rpc("wa_envio_set_automatico", { p_envio: v.envio, p_on: v.on });
      if (error) throw new FriendlyError(dbError(error, "Não conseguimos mudar o envio automático."));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

/** T5.22 Fase 3: reenviar um envio já aprovado na semana: "faltantes" (só quem não recebeu) ou "todos". */
export function useReenviar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { envio: string; modo: "faltantes" | "todos" }) => {
      const { data, error } = await supabase.rpc("wa_envio_reenviar", { p_envio: v.envio, p_modo: v.modo });
      if (error) throw new FriendlyError(dbError(error, "Não conseguimos reenviar."));
      return data as { na_fila: number; sem_grupo: number };
    },
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export const DISPARO_LABEL: Record<DisparoStatus, string> = {
  pendente: "Na fila", enviando: "Enviando", enviado: "Enviado", falhou: "Falhou", pulado: "Pulado",
};
