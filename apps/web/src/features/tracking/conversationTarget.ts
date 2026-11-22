import type { WaConversation } from "./conversationsApi.ts";

/** Quem a sugestão da IA aponta (vem no endereço do link "Abrir a conversa e marcar a venda"). */
export interface ConversationTarget { contato: number | null; final: string | null; nome: string | null }

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/** Lê o alvo dos parâmetros do endereço (?contato=&final=&nome=). Sem nenhum dos três: null. */
export function targetFromParams(get: (k: string) => string | null): ConversationTarget | null {
  const c = Number(get("contato"));
  const t: ConversationTarget = {
    contato: Number.isInteger(c) && c > 0 ? c : null,
    final: (get("final") ?? "").replace(/\D/g, "").slice(0, 6) || null,
    nome: (get("nome") ?? "").trim().slice(0, 120) || null,
  };
  return t.contato || t.final || t.nome ? t : null;
}

/** A conversa da pessoa: pelo contato; senão pelo final do telefone + nome; senão só pelo final (se for único) ou só pelo nome (se for único). */
export function findTargetConversation(people: readonly WaConversation[], t: ConversationTarget): WaConversation | null {
  if (t.contato) {
    const byContact = people.find((p) => p.contact_id === t.contato);
    if (byContact) return byContact;
  }
  const tail = (p: WaConversation) => (t.final ? (p.phone_tail === t.final || (p.phone ?? "").endsWith(t.final)) : false);
  if (t.final && t.nome) {
    const both = people.find((p) => tail(p) && norm(p.push_name) === norm(t.nome));
    if (both) return both;
  }
  if (t.final) {
    const only = people.filter(tail);
    if (only.length === 1) return only[0];
  }
  if (t.nome) {
    const only = people.filter((p) => norm(p.push_name) === norm(t.nome));
    if (only.length === 1) return only[0];
  }
  return null;
}

/** Endereço para abrir a conversa de uma pessoa da sugestão. */
export function conversationLink(clientId: string, s: { contact_id: number | null; phone_tail: string | null; push_name: string | null }): string {
  const q = new URLSearchParams();
  if (s.contact_id) q.set("contato", String(s.contact_id));
  if (s.phone_tail) q.set("final", s.phone_tail);
  if (s.push_name) q.set("nome", s.push_name);
  const qs = q.toString();
  return `/clientes/${clientId}/conversas${qs ? `?${qs}` : ""}`;
}
