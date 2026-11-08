import { assertEquals, assertMatch, assertNotEquals } from "jsr:@std/assert@1";
import { buildLeadReceive } from "./logic.ts";
import type { Container } from "../track/logic.ts";

const container: Container = { id: "c1", client_id: "k1", allowed_domains: ["loja.com.br"], status: "ativo", test_mode: false, consent_mode: "nao_exigir" };
const mapping = { phone: "tel", email: "mail", name: "nome", utm_source: "utm_source", utm_campaign: "utm_campaign", fbclid: "fbclid", bf_c: "bf_c", page_url: "pagina" };
const NOW = Date.UTC(2026, 10, 8, 12, 0, 0);
const WH = "0123abcd-0000-4000-8000-000000000000";
const aviso = JSON.stringify({ tel: "(45) 99999-8888", mail: "Ana@X.com", nome: "Ana Maria Souza", utm_source: "facebook", utm_campaign: "Janeiro", fbclid: "IwAR1", bf_c: "120", pagina: "https://www.loja.com.br/oferta?email=ana@x.com" });

Deno.test("aviso com origem vira o mesmo pacote do script: URL só com parâmetros de campanha, tudo cifrado, nova origem", async () => {
  const r = await buildLeadReceive(WH, aviso, "application/json", mapping, container, NOW, false);
  if (r.result !== "enviar") throw new Error(r.result);
  const i = r.ingest;
  assertEquals(i.event.name, "Lead");
  assertEquals(i.event.page_url, "https://www.loja.com.br/oferta?utm_source=facebook&utm_campaign=Janeiro&fbclid=IwAR1&bf_c=120");
  assertEquals(i.event.custom_data, { canal: "formulario_externo" });
  assertMatch(i.user!.em!, /^[0-9a-f]{64}$/);
  assertMatch(i.user!.ph!, /^[0-9a-f]{64}$/);
  assertMatch(i.user!.fn!, /^[0-9a-f]{64}$/);
  assertMatch(i.user!.ln!, /^[0-9a-f]{64}$/);
  assertEquals(i.touch !== null, true);
  assertEquals((i.touch as Record<string, unknown>).fbclid, "IwAR1");
  assertEquals((i.touch as Record<string, unknown>).ad_campaign_id, "120");
  assertEquals(i.capi.fbc, `fb.1.${NOW}.IwAR1`);
  const txt = JSON.stringify(i);
  assertEquals(txt.includes("99999"), false); // telefone legível nunca sai
  assertEquals(txt.toLowerCase().includes("ana@x.com"), false);
});

Deno.test("mesma pessoa, mesmo endereço e mesmo dia: mesmo event_id (não repete); outro dia, outro", async () => {
  const a = await buildLeadReceive(WH, aviso, null, mapping, container, NOW, false);
  const b = await buildLeadReceive(WH, aviso, null, mapping, container, NOW + 3600_000, false);
  const c = await buildLeadReceive(WH, aviso, null, mapping, container, NOW + 86_400_000, false);
  if (a.result !== "enviar" || b.result !== "enviar" || c.result !== "enviar") throw new Error("esperava enviar");
  assertEquals(a.ingest.event.event_id, b.ingest.event.event_id);
  assertNotEquals(a.ingest.event.event_id, c.ingest.event.event_id);
});

Deno.test("aviso sem origem: continua sendo lead, mas sem inventar origem (sem touch)", async () => {
  const r = await buildLeadReceive(WH, JSON.stringify({ tel: "11999998888" }), null, mapping, container, NOW, false);
  if (r.result !== "enviar") throw new Error(r.result);
  assertEquals(r.ingest.touch, null);
  assertEquals(r.ingest.event.page_url, "https://loja.com.br/");
  assertEquals(r.ingest.user!.em, undefined);
});

Deno.test("página de outro domínio é ignorada (usa o domínio do site); modo teste confere e não envia", async () => {
  const r = await buildLeadReceive(WH, JSON.stringify({ tel: "11999998888", pagina: "https://outro.com/x" }), null, mapping, container, NOW, false);
  if (r.result !== "enviar") throw new Error(r.result);
  assertEquals(r.ingest.event.page_url, "https://loja.com.br/");
  const t = await buildLeadReceive(WH, aviso, null, mapping, container, NOW, true);
  assertEquals(t.result, "teste");
});

Deno.test("recusas e site com consentimento", async () => {
  assertEquals((await buildLeadReceive(WH, "texto solto", "text/plain", mapping, container, NOW, false)).result, "recusado");
  assertEquals((await buildLeadReceive(WH, JSON.stringify({ x: 1 }), null, mapping, container, NOW, false)).result, "recusado");
  assertEquals((await buildLeadReceive(WH, JSON.stringify({ tel: "123", mail: "x" }), null, mapping, container, NOW, false)).result, "recusado");
  assertEquals((await buildLeadReceive(WH, aviso, null, mapping, { ...container, consent_mode: "aguardar_consentimento" }, NOW, false)).result, "ignorado");
});
