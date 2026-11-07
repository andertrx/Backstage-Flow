import { assert, assertEquals } from "jsr:@std/assert@1";
import { classificar, disparoValido, enviarTexto, pausaAleatoria } from "./logic.ts";

const cfg = { baseUrl: "https://whats.exemplo.com.br", instance: "backstage", key: "CHAVE-SECRETA-123456" };
const d = { id: 7, grupo_id: "120363000000000001@g.us", mensagem: "Bom dia!", tentativa: 1 };

Deno.test("só envia para grupo e mensagem válidos", () => {
  assert(disparoValido(d));
  assert(!disparoValido({ ...d, grupo_id: "5511999990000@s.whatsapp.net" }));
  assert(!disparoValido({ ...d, mensagem: "  " }));
  assert(!disparoValido({ ...d, mensagem: "x".repeat(4001) }));
  assert(!disparoValido(null));
});

Deno.test("pausa entre 1,2 s e 3,5 s", () => {
  assertEquals(pausaAleatoria(() => 0), 1200);
  assert(pausaAleatoria(() => 0.999) <= 3500);
});

Deno.test("classificação das respostas", () => {
  assert(classificar(201).ok);
  assert(classificar(500).retry && classificar(429).retry && classificar("sem_conexao").retry);
  assert(!classificar(400).retry && !classificar(404).retry);
  assert(classificar(401).acesso && classificar(403).acesso && !classificar(401).retry);
  assert(!classificar(302).ok && !classificar(302).retry);
});

Deno.test("envia pelo caminho certo, com a chave só no cabeçalho", async () => {
  let url = "", init: RequestInit | undefined;
  const f = ((u: string, i: RequestInit) => { url = u; init = i; return Promise.resolve(new Response("{}", { status: 201 })); }) as unknown as typeof fetch;
  const r = await enviarTexto(cfg, d, 1500, f);
  assert(r.ok);
  assertEquals(url, "https://whats.exemplo.com.br/message/sendText/backstage");
  assertEquals((init?.headers as Record<string, string>).apikey, cfg.key);
  const body = JSON.parse(String(init?.body));
  assertEquals(body.number, d.grupo_id);
  assertEquals(body.text, "Bom dia!");
  assert(!JSON.stringify(body).includes(cfg.key));
});

Deno.test("falha de rede vira nova tentativa; endereço inseguro vira falha", async () => {
  const f = (() => Promise.reject(new Error("x"))) as unknown as typeof fetch;
  assert((await enviarTexto(cfg, d, 1500, f)).retry);
  const r = await enviarTexto({ ...cfg, baseUrl: "http://127.0.0.1" }, d, 1500, f);
  assert(!r.ok && !r.retry);
});
