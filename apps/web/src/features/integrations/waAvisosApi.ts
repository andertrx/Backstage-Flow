import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FriendlyError, friendlyDbError } from "@/lib/errors.ts";
import { supabase } from "@/lib/supabase.ts";

// Etapa 45.3 — configuração dos avisos no WhatsApp (grupo só do administrador).

export interface WaAvisosConfig {
  ativo: boolean;
  grupo_id: string | null;
  grupo_nome: string | null;
  tipos: string[];
  silencio_inicio: number;
  silencio_fim: number;
  repetir_horas: number;
  sem_gasto_inicio: number;
  sem_gasto_fim: number;
  sem_gasto_minutos: number;
}
export interface WaAviso {
  id: number;
  tipo: string;
  texto: string;
  status: "pendente" | "enviando" | "enviado" | "falhou" | "pulado";
  detalhe: string | null;
  created_at: string;
  enviado_em: string | null;
}

/** Tipos de aviso que o administrador pode ligar, na ordem da tela. */
export const WA_AVISO_TIPOS: { id: string; label: string; hint?: string }[] = [
  { id: "sem_saldo", label: "Conta sem saldo" },
  { id: "saldo_baixo", label: "Saldo acabando", hint: "no ritmo atual de gasto, conforme a regra de saldo do CRM" },
  { id: "pagamento_pendente", label: "Pagamento pendente" },
  { id: "conta_restrita", label: "Conta restrita" },
  { id: "conta_desativada", label: "Conta desativada" },
  { id: "erro_api", label: "Erro de conexão com a plataforma" },
  { id: "sem_gasto", label: "Cliente sem gastar", hint: "precisão de cerca de 1 hora; só em horário comercial" },
  { id: "envio_aprovar", label: "Última chamada para aprovar o envio semanal" },
];

const KEY = ["wa-avisos"] as const;
const dbError = (e: { code?: string; message: string }, fb: string) => (e.code === "22023" || e.code === "42501" ? e.message : friendlyDbError(e, fb));

export function useWaAvisosConfig() {
  return useQuery({
    queryKey: [...KEY, "config"],
    queryFn: async () => {
      const { data, error } = await supabase.from("wa_avisos_config")
        .select("ativo,grupo_id,grupo_nome,tipos,silencio_inicio,silencio_fim,repetir_horas,sem_gasto_inicio,sem_gasto_fim,sem_gasto_minutos").eq("id", true).maybeSingle();
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar os avisos no WhatsApp."));
      return data as WaAvisosConfig | null;
    },
  });
}

export function useWaSemGastoSilenciados() {
  return useQuery({
    queryKey: [...KEY, "silenciados"],
    queryFn: async () => {
      const { data, error } = await supabase.from("wa_sem_gasto_silenciados").select("cliente_id");
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar os clientes silenciados."));
      return new Set(((data as { cliente_id: string }[] | null) ?? []).map((r) => r.cliente_id));
    },
  });
}

export function useWaAvisosRecentes() {
  return useQuery({
    queryKey: [...KEY, "recentes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("wa_avisos").select("id,tipo,texto,status,detalhe,created_at,enviado_em").order("id", { ascending: false }).limit(8);
      if (error) throw new FriendlyError(friendlyDbError(error, "Não conseguimos carregar os últimos avisos."));
      return (data as WaAviso[] | null) ?? [];
    },
  });
}

export function useSalvarWaAvisos() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { config: WaAvisosConfig; silenciar: { cliente_id: string; silenciar: boolean }[] }) => {
      const c = v.config;
      const a = await supabase.rpc("wa_avisos_config_save", {
        p_ativo: c.ativo, p_grupo_id: c.grupo_id, p_grupo_nome: c.grupo_nome, p_tipos: c.tipos,
        p_ini: c.silencio_inicio, p_fim: c.silencio_fim, p_repetir: c.repetir_horas,
      });
      if (a.error) throw new FriendlyError(dbError(a.error, "Não conseguimos salvar os avisos."));
      const b = await supabase.rpc("wa_sem_gasto_config_save", { p_ini: c.sem_gasto_inicio, p_fim: c.sem_gasto_fim, p_minutos: c.sem_gasto_minutos });
      if (b.error) throw new FriendlyError(dbError(b.error, "Não conseguimos salvar a janela do aviso de sem gasto."));
      for (const s of v.silenciar) {
        const r = await supabase.rpc("wa_sem_gasto_silenciar", { p_cliente: s.cliente_id, p_silenciar: s.silenciar });
        if (r.error) throw new FriendlyError(dbError(r.error, "Não conseguimos salvar os clientes silenciados."));
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
