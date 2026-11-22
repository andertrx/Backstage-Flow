import { describe, expect, it } from "vitest";
import { conversationLink, findTargetConversation, targetFromParams } from "./conversationTarget.ts";
import type { WaConversation } from "./conversationsApi.ts";

const p = (id: number, nome: string | null, tail: string | null, contato: number | null = null): WaConversation => ({
  person_id: id, push_name: nome, phone: tail ? `55119999${tail}` : null, phone_tail: tail, last_at: "2026-11-21T10:00:00Z", last_direction: "recebida",
  last_preview: "oi", messages: 2, origin: "desconhecida", from_ad: false, ad_id: null, contact_id: contato, contact_sales: null,
  suggestion_id: null, suggestion_reason: null, suggestion_confidence: null,
});
const gente = [p(1, "Gabriela Miranda", "1925"), p(2, "Josefa", "8022", 77), p(3, "Gabriela Souza", "1925"), p(4, null, "5555")];

describe("abrir a conversa da sugestão", () => {
  it("lê os parâmetros do endereço e ignora lixo", () => {
    const get = (m: Record<string, string>) => (k: string) => m[k] ?? null;
    expect(targetFromParams(get({ contato: "77", final: "80-22", nome: " Josefa " }))).toEqual({ contato: 77, final: "8022", nome: "Josefa" });
    expect(targetFromParams(get({ contato: "abc" }))).toBeNull();
    expect(targetFromParams(get({}))).toBeNull();
  });
  it("acha pelo contato, mesmo que o nome tenha mudado", () => {
    expect(findTargetConversation(gente, { contato: 77, final: null, nome: "outro nome" })?.person_id).toBe(2);
  });
  it("acha pelo final do telefone + nome (final repetido não confunde)", () => {
    expect(findTargetConversation(gente, { contato: null, final: "1925", nome: "gabriela miranda" })?.person_id).toBe(1);
    expect(findTargetConversation(gente, { contato: null, final: "1925", nome: "Gabriela Souza" })?.person_id).toBe(3);
  });
  it("só pelo final: só vale se for único; se repetir, não adivinha", () => {
    expect(findTargetConversation(gente, { contato: null, final: "8022", nome: null })?.person_id).toBe(2);
    expect(findTargetConversation(gente, { contato: null, final: "1925", nome: null })).toBeNull();
  });
  it("sem nome salvo, o final do telefone basta", () => {
    expect(findTargetConversation(gente, { contato: null, final: "5555", nome: null })?.person_id).toBe(4);
  });
  it("não acha: devolve null (a tela avisa)", () => {
    expect(findTargetConversation(gente, { contato: 999, final: "0000", nome: "Ninguém" })).toBeNull();
  });
  it("monta o link com o que a sugestão tem", () => {
    expect(conversationLink("c1", { contact_id: null, phone_tail: "1925", push_name: "Gabriela Miranda" })).toBe("/clientes/c1/conversas?final=1925&nome=Gabriela+Miranda");
    expect(conversationLink("c1", { contact_id: 5, phone_tail: null, push_name: null })).toBe("/clientes/c1/conversas?contato=5");
    expect(conversationLink("c1", { contact_id: null, phone_tail: null, push_name: null })).toBe("/clientes/c1/conversas");
  });
});
