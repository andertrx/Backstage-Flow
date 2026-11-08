import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FriendlyError, friendlyDbError } from "@/lib/errors.ts";
import { supabase } from "@/lib/supabase.ts";

/**
 * Conversas do WhatsApp na palma da mão (Tracking T5.7). O banco confere quem lê (administrador, gestor do cliente e
 * Account Manager do cliente) e quem apaga (só administrador). Texto guardado sem prazo; o telefone completo fica aqui.
 */
export interface WaConversation {
  person_id: number;
  push_name: string | null;
  phone: string | null;
  phone_tail: string | null;
  last_at: string;
  last_direction: "recebida" | "enviada" | null;
  last_preview: string | null;
  messages: number;
  origin: "anuncio_whatsapp" | "site" | "desconhecida";
  from_ad: boolean;
  ad_id: string | null;
  contact_id: number | null;
  contact_sales: number | null;
  suggestion_id: string | null;
  suggestion_reason: string | null;
  suggestion_confidence: "alta" | "media" | "baixa" | null;
}

export interface WaMessage {
  id: number;
  direction: "recebida" | "enviada";
  at: string;
  body: string;
}

const KEY = ["wa-conversations"] as const;
export const CONVERSATIONS_PAGE = 50;
export const MESSAGES_PAGE = 60;
// Regras do banco que já vêm em português (22023 = dado inválido; P0002 = não encontrado; 23505 = repetido; 42501 = sem permissão).
const ruleError = (error: { code?: string; message: string }, fallback: string) =>
  new FriendlyError(["22023", "P0002", "23505", "42501"].includes(error.code ?? "") ? error.message : friendlyDbError(error, fallback));

export function useWaConversations(clientId: string | undefined, search: string) {
  return useInfiniteQuery({
    queryKey: [...KEY, "list", clientId, search],
    enabled: Boolean(clientId),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase.rpc("wa_conversations_list", {
        p_client: clientId, p_search: search.trim() || null, p_limit: CONVERSATIONS_PAGE, p_before: pageParam,
      });
      if (error) throw ruleError(error, "Não conseguimos carregar as conversas.");
      return (data ?? []) as WaConversation[];
    },
    getNextPageParam: (last) => (last.length === CONVERSATIONS_PAGE ? last[last.length - 1].last_at : undefined),
  });
}

/** Mensagens da conversa: cada página traz as mais novas primeiro; a tela mostra em ordem de leitura (mais antiga em cima). */
export function useWaMessages(personId: number | null) {
  return useInfiniteQuery({
    queryKey: [...KEY, "messages", personId],
    enabled: personId != null,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase.rpc("wa_conversation_messages", { p_person: personId, p_before: pageParam, p_limit: MESSAGES_PAGE });
      if (error) throw ruleError(error, "Não conseguimos carregar a conversa.");
      return (data ?? []) as WaMessage[];
    },
    getNextPageParam: (last) => (last.length === MESSAGES_PAGE ? last[last.length - 1].at : undefined),
  });
}

export function useWaConversationDelete() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (personId: number) => {
      const { error } = await supabase.rpc("wa_conversation_delete", { p_person: personId });
      if (error) throw ruleError(error, "Não conseguimos apagar a conversa.");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export interface MarkSaleResult { etapa?: string; venda_meta?: string | null }

/**
 * "Marcar venda": acha (ou cria) o Contato da pessoa e põe na etapa de venda com valor e moeda — o mesmo caminho da tela
 * Contatos, que alimenta a API de Conversões do Meta. Funciona também para conversa sem anúncio (orgânica).
 */
export function useWaMarkSale() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { personId: number; stageId: string; value: number; currency: string; suggestionId?: string | null }) => {
      const contact = await supabase.rpc("wa_person_contact", { p_person: input.personId });
      if (contact.error) throw ruleError(contact.error, "Não conseguimos achar o contato desta conversa.");
      const { data, error } = await supabase.rpc("contact_update", {
        p_id: contact.data as number, p_stage: input.stageId, p_profile: null, p_value: input.value, p_currency: input.currency, p_order: null,
      });
      if (error) throw ruleError(error, "Não conseguimos marcar a venda.");
      if (input.suggestionId) {
        // A sugestão da IA vira "confirmada" (some em 30 dias). Se falhar, a venda já está marcada: não desfaz nada.
        await supabase.rpc("wa_suggestion_decide", { p_id: input.suggestionId, p_status: "confirmada" });
      }
      return (data ?? {}) as MarkSaleResult;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KEY });
      void queryClient.invalidateQueries({ queryKey: ["contacts"] });
      void queryClient.invalidateQueries({ queryKey: ["tracking"] });
    },
  });
}

export function useWaSuggestionDiscard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (suggestionId: string) => {
      const { error } = await supabase.rpc("wa_suggestion_decide", { p_id: suggestionId, p_status: "descartada" });
      if (error) throw ruleError(error, "Não conseguimos descartar a sugestão.");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

/** 5545999998888 → +55 (45) 99999-8888. Sem telefone completo, mostra só o final guardado. */
export function formatWaPhone(phone: string | null, tail: string | null): string {
  if (!phone) return tail ? `final ${tail}` : "sem número";
  if (/^55\d{10,11}$/.test(phone)) {
    const ddd = phone.slice(2, 4);
    const rest = phone.slice(4);
    return `+55 (${ddd}) ${rest.length === 9 ? `${rest.slice(0, 5)}-${rest.slice(5)}` : `${rest.slice(0, 4)}-${rest.slice(4)}`}`;
  }
  return `+${phone}`;
}

export const WA_ORIGIN_LABEL: Record<WaConversation["origin"], string> = {
  anuncio_whatsapp: "Anúncio de WhatsApp",
  site: "Veio do site",
  desconhecida: "Sem origem (orgânico ou direto)",
};
