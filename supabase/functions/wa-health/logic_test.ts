import { assertEquals } from "jsr:@std/assert@1";
import { classificar, itensValidos } from "./logic.ts";

Deno.test("aberto = conectado; fechado = desconectado; conectando = aguardando leitura", () => {
  assertEquals(classificar({ status: 200, body: { instance: { state: "open" } } }), { tipo: "estado", state: "conectado" });
  assertEquals(classificar({ status: 200, body: { instance: { state: "close" } } }), { tipo: "estado", state: "desconectado" });
  assertEquals(classificar({ status: 200, body: { state: "connecting" } }), { tipo: "estado", state: "aguardando_leitura" });
});

Deno.test("instância que sumiu do servidor (404) é problema do cliente", () => {
  assertEquals(classificar({ status: 404, body: null }), { tipo: "estado", state: "desconhecido" });
});

Deno.test("servidor fora do ar, chave recusada ou erro interno NÃO mexe no estado dos clientes", () => {
  assertEquals(classificar(null), { tipo: "servidor" });
  assertEquals(classificar({ status: 401, body: null }), { tipo: "servidor" });
  assertEquals(classificar({ status: 403, body: null }), { tipo: "servidor" });
  assertEquals(classificar({ status: 500, body: null }), { tipo: "servidor" });
  assertEquals(classificar({ status: 502, body: null }), { tipo: "servidor" });
});

Deno.test("lista do banco: só itens válidos e com limite", () => {
  const ok = { id: "11111111-1111-1111-1111-111111111111", instance: "bf-abc123" };
  assertEquals(itensValidos([ok, { id: "x", instance: "bf-abc" }, { id: ok.id, instance: "../etc" }, null, "a"]), [ok]);
  assertEquals(itensValidos("não é lista"), []);
  assertEquals(itensValidos([ok, ok, ok], 2).length, 2);
});
