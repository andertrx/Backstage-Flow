import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FriendlyError, friendlyFunctionError } from "@/lib/errors.ts";
import { supabase } from "@/lib/supabase.ts";

// Etapa 46.1 — conexão do Google Agenda de cada pessoa.

export interface AgendaConexao {
  google_email: string | null;
  status: "conectada" | "erro" | "desconectada";
  connected_at: string;
  last_sync_at: string | null;
  last_error: string | null;
}
export interface AgendaStatus {
  configured: boolean;
  conexao: AgendaConexao | null;
}

/** Endereço para onde o Google devolve a pessoa depois da autorização (precisa estar cadastrado no Google Cloud). */
export const agendaRedirectUri = () => `${window.location.origin}/google-agenda/retorno`;

const KEY = ["google-agenda"] as const;

async function call<T>(body: { action: "status" } | { action: "start"; redirectUri: string } | { action: "complete"; code: string; state: string; redirectUri: string } | { action: "disconnect" }): Promise<T> {
  const { data, error } = await supabase.functions.invoke("google-agenda", { body });
  if (error) throw new FriendlyError(await friendlyFunctionError(error));
  return (data as { data: T }).data;
}

export function useAgendaStatus(enabled = true) {
  return useQuery({ queryKey: KEY, enabled, queryFn: () => call<AgendaStatus>({ action: "status" }) });
}

/** Abre o Google para a pessoa autorizar (o servidor devolve o link oficial). */
export function useConectarAgenda() {
  return useMutation({
    mutationFn: async () => {
      const { url } = await call<{ url: string }>({ action: "start", redirectUri: agendaRedirectUri() });
      window.location.assign(url);
    },
  });
}

export function useConcluirAgenda() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { code: string; state: string }) => call<{ conexao: AgendaConexao | null }>({ action: "complete", ...v, redirectUri: agendaRedirectUri() }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDesconectarAgenda() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => call<{ conexao: AgendaConexao | null }>({ action: "disconnect" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
