import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { buildMonitorEmail, monitorLink } from "./logic.ts";

Deno.test("link do aviso: só endereços do monitoramento", () => {
  assertEquals(monitorLink("/monitoramento?aba=alertas&alerta=12"), "https://www.backstageflow.com.br/monitoramento?aba=alertas&alerta=12");
  assertEquals(monitorLink("https://golpe.com"), "https://www.backstageflow.com.br/monitoramento?aba=alertas");
  assertEquals(monitorLink("/monitoramento?x=<script>"), "https://www.backstageflow.com.br/monitoramento?aba=alertas");
  assertEquals(monitorLink(null), "https://www.backstageflow.com.br/monitoramento?aba=alertas");
});

Deno.test("e-mail: assunto, saudação e texto escapado", () => {
  const e = buildMonitorEmail({ toName: "Maria Gestora", subject: "Alerta crítico: <CPA> subiu", body: "Cliente A & B", link: "/monitoramento?aba=alertas&alerta=3" });
  assertEquals(e.subject, "Alerta crítico: <CPA> subiu");
  assertStringIncludes(e.html, "Alerta crítico: &lt;CPA&gt; subiu");
  assertStringIncludes(e.html, "Cliente A &amp; B");
  assertStringIncludes(e.html, "Olá, Maria.");
  assert(!e.html.includes("<CPA>"));
  assertStringIncludes(e.text, "Abrir: https://www.backstageflow.com.br/monitoramento?aba=alertas&alerta=3");
});

Deno.test("e-mail sem assunto nem nome usa padrão", () => {
  const e = buildMonitorEmail({ toName: null, subject: "  ", body: null, link: null });
  assertEquals(e.subject, "Aviso do monitoramento");
  assertStringIncludes(e.text, "Olá.");
});
