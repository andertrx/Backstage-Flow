/**
 * Teste de navegador da Etapa 45.3 — configuração dos avisos no WhatsApp (Integrações). Supabase e servidor de conexão SIMULADOS.
 */
import { check, launch, login, mockSupabase, SHOTS } from "./support.mjs";

const client = (id, name) => ({ id, name, company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo",
  timezone: "America/Sao_Paulo", is_demo: false, created_at: "2026-09-01T10:00:00Z", updated_at: "2026-09-01T10:00:00Z" });
const A = "a4500000-0000-4000-8000-0000000000a5";
const B = "b4500000-0000-4000-8000-0000000000b5";
const t = "2026-10-27T12:00:00Z";
const G = "120363000000000055@g.us";

function seed(db) {
  db.clients.push(client(A, "Loja Aurora"), client(B, "Loja Brisa"));
  Object.assign(db.waGw, { base_url: "https://whats.exemplo.com.br", has_key: true, risk_accepted_at: t, enabled: true, connection_state: "conectado" });
  db.waSim.state = "open";
  db.waSim.groups = [{ id: G, name: "Avisos Backstage", size: 1 }, { id: "120363000000000056@g.us", name: "Família", size: 9 }];
  db.waAvisos.push({ id: 1, tipo: "sem_saldo", texto: "⚠️ Loja Aurora (Meta): Sem saldo disponível.", status: "enviado", detalhe: null, created_at: t, enviado_em: t });
}

{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  await login(page, "/configuracoes/integracoes");
  const card = page.getByTestId("wa-avisos-card");
  await card.waitFor();
  check((await card.innerText()).includes("Desligado"), "começa desligado");
  check((await card.getByTestId("wa-avisos-recentes").innerText()).includes("Loja Aurora"), "mostra os últimos avisos");
  check(await card.getByTestId("wa-sem-gasto").count() === 0, "janela do sem gasto só aparece com o tipo marcado");
  // T5.31: opções em grupos (alertas das contas, tarefas, reuniões, clientes/leads/envios)
  const grupos = await card.locator("[data-testid^=wa-avisos-grupo-]").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
  check(grupos.join(",") === "wa-avisos-grupo-contas,wa-avisos-grupo-tarefas,wa-avisos-grupo-reunioes,wa-avisos-grupo-outros", `quatro grupos de avisos (${grupos.join(", ")})`);
  const contas = await card.getByTestId("wa-avisos-grupo-contas").locator("input[type=checkbox]").count();
  check(contas === 12, `alertas das contas: todas as 11 situações + cliente sem gastar (${contas})`);
  check(await card.getByTestId("wa-avisos-grupo-tarefas").getByLabel("Tarefa atrasada").count() === 1 && await card.getByTestId("wa-avisos-grupo-tarefas").getByLabel("Fui mencionado num comentário").count() === 1, "avisos de tarefas disponíveis");
  await card.getByRole("button", { name: "Marcar todos: Tarefas" }).click();
  check((await card.getByRole("button", { name: "Desmarcar todos: Tarefas" }).count()) === 1, "marcar todos as tarefas");
  await card.getByTestId("wa-avisos-grupo-reunioes").getByLabel("Reunião hoje").check();

  // ligar sem grupo é recusado
  await card.getByRole("switch", { name: "Ligar avisos no WhatsApp" }).click();
  await card.getByRole("button", { name: "Salvar avisos" }).click();
  await card.getByText("Escolha o grupo de avisos antes de ligar.").waitFor();
  check(!db.waAvisosCfg.ativo, "sem grupo escolhido não liga");

  await card.getByRole("button", { name: "Buscar grupos no WhatsApp" }).click();
  await card.getByRole("combobox", { name: "Grupo de avisos" }).selectOption(G);
  await card.getByLabel("Cliente sem gastar", { exact: false }).first().check();
  const sg = card.getByTestId("wa-sem-gasto");
  await sg.waitFor();
  await sg.getByLabel("Avisar sem gasto: Loja Brisa").uncheck();
  // T5.34: o período pode ser escolhido por conta (a tela global é de 6 a 12 h)
  await sg.getByLabel("Período sem gasto: Loja Aurora").selectOption("480");
  check((await sg.getByLabel("Minutos sem gasto").inputValue()) === "360", "o período geral começa em 6 h");
  await card.getByRole("combobox", { name: "Silêncio de" }).selectOption("23");
  await page.screenshot({ path: `${SHOTS}/wa-avisos.png`, fullPage: false });
  await card.getByRole("button", { name: "Salvar avisos" }).click();
  await card.getByText("Avisos salvos.").waitFor();
  const c = db.waAvisosCfg;
  check(c.ativo && c.grupo_id === G && c.tipos.includes("sem_gasto") && c.silencio_inicio === 23, "salva grupo, tipos e silêncio");
  check(["n:tarefa.atribuida", "n:tarefa.mencao", "n:tarefa.comentario", "n:tarefa.concluida", "n:tarefa.prazo", "n:tarefa.atrasada", "n:reuniao.hoje"].every((i) => c.tipos.includes(i)), "salva também os avisos de tarefas e de reunião escolhidos");
  check(db.waSemGasto.length === 1 && db.waSemGasto[0] === B, "Loja Brisa fica silenciada no sem gasto");
  check(db.rpcCalls.some((x) => x.fn === "wa_sem_gasto_config_save" && x.p_ini === 8 && x.p_fim === 22 && x.p_minutos === 360), "salva a janela 8h–22h e 6 h");
  check(db.waSemGastoMinutos.length === 1 && db.waSemGastoMinutos[0].cliente_id === A && db.waSemGastoMinutos[0].minutos === 480, "salva o período de 8 h da Loja Aurora");
  const opcoes = await sg.getByLabel("Período sem gasto: Loja Aurora").locator("option").allTextContents();
  check(opcoes.join(",") === "Padrão,6 h,8 h,10 h,12 h", `períodos de 6 a 12 h mais o padrão (${opcoes.join(", ")})`);
  check(errors.length === 0, `sem erros no console (${errors.join(" | ")})`);
  await browser.close();
}

// Quem não é administrador não vê o cartão
{
  const { browser, page } = await launch();
  const db = await mockSupabase(page, { role: "gestor" });
  seed(db);
  await login(page, "/configuracoes/integracoes");
  await page.waitForTimeout(1500);
  check(await page.getByTestId("wa-avisos-card").count() === 0, "gestor não vê os avisos no WhatsApp");
  await browser.close();
}
console.log("OK: wa-avisos");
