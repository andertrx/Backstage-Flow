import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { avisoCorpo, avisoEmail, avisoPush, avisoTitulo, ENVIOS_URL } from "./logic.ts";

const base = { momento: "inicio" as const, nome: "Envio <Relatório> & Cia", codigo: "ENV-001", horario: "08:00", grupos: 22, nome_pessoa: "Ander Rodrigues" };

Deno.test("título muda na última chamada", () => {
  assertEquals(avisoTitulo(base), "Aprove o envio de hoje até 08:00");
  assertEquals(avisoTitulo({ ...base, momento: "fim" }), "Última chamada: aprove o envio de hoje até 08:00");
});

Deno.test("corpo e push levam código, nome, grupos e horário, e o link da tela de envios", () => {
  assertStringIncludes(avisoCorpo(base), "ENV-001 · Envio <Relatório> & Cia · 22 grupo(s)");
  const p = avisoPush(base);
  assertEquals(p.url, ENVIOS_URL);
  assertEquals(p.url, "https://www.backstageflow.com.br/operacoes/envios");
  assertEquals(p.tag, "envio-aprovar-ENV-001");
});

Deno.test("e-mail escapa o texto e traz saudação e botão", () => {
  const e = avisoEmail(base);
  assertStringIncludes(e.html, "Envio &lt;Relatório&gt; &amp; Cia");
  assert(!e.html.includes("<Relatório>"));
  assertStringIncludes(e.html, "Olá, Ander.");
  assertStringIncludes(e.html, `href="${ENVIOS_URL}"`);
  assertStringIncludes(e.text, `Revisar e aprovar: ${ENVIOS_URL}`);
  assertEquals(avisoEmail({ ...base, nome_pessoa: null }).text.includes("Olá.\n"), true);
});

import { waAvisoEmail, waAvisoPush, WA_CONEXAO_URL } from "./logic.ts";
const wa = { tipo: "caiu" as const, titulo: "WhatsApp dos envios sem conexão", corpo: "Há 10 min sem conexão: <teste> & mais.", nome_pessoa: "Ander Rodrigues" };

Deno.test("aviso de WhatsApp caiu/voltou: push com link de Integrações e e-mail escapado", () => {
  const p = waAvisoPush(wa);
  assertEquals(p.url, "https://www.backstageflow.com.br/configuracoes/integracoes");
  assertEquals(p.tag, "wa-conexao-caiu");
  const e = waAvisoEmail(wa);
  assertStringIncludes(e.html, "&lt;teste&gt; &amp; mais.");
  assert(!e.html.includes("<teste>"));
  assertStringIncludes(e.html, `href="${WA_CONEXAO_URL}"`);
  assertStringIncludes(e.text, "Olá, Ander.");
  assertEquals(waAvisoPush({ ...wa, tipo: "voltou" }).tag, "wa-conexao-voltou");
});
