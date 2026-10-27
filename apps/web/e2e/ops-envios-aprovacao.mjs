/**
 * Teste de navegador da Etapa 41.2 — aprovação semanal do envio (pop-up das 7h até o horário). Supabase SIMULADO,
 * com o relógio do simulador (db.envioAgora) numa segunda-feira.
 */
import { BASE, check, launch, login, mockSupabase, SHOTS, USER_ID } from "./support.mjs";

const client = (id, name) => ({ id, name, company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo",
  timezone: "America/Sao_Paulo", is_demo: false, created_at: "2026-09-01T10:00:00Z", updated_at: "2026-09-01T10:00:00Z" });
const A = "a2000000-0000-4000-8000-0000000000a2";
const B = "b2000000-0000-4000-8000-0000000000b2";
const ENVIO = "e4100000-0000-4000-8000-0000000000e4";
const SEG_0830 = "2026-11-02T11:30:00Z"; // segunda-feira, 8h30 em Brasília
const SEG_0630 = "2026-11-02T09:30:00Z"; // 6h30
const SEG_1030 = "2026-11-02T13:30:00Z"; // 10h30 (depois do horário)
const sectorId = (db, name) => db.opsSectors.find((s) => s.name === name).id;

function seed(db) {
  db.clients.push(client(A, "Loja Aurora"), client(B, "Loja Brisa"));
  const t = "2026-10-27T12:00:00Z";
  db.opsEnvios.push({ id: ENVIO, nome: "Feedback semanal", mensagem: "Bom dia! ☀️\n*Como foi a semana?*", dia_semana: 1, horario: "10:00", ativo: true,
    arquivado_em: null, versao: 1, criado_por: USER_ID, atualizado_por: USER_ID, created_at: t, updated_at: t });
  db.opsEnvioClientes.push(
    { id: crypto.randomUUID(), envio_id: ENVIO, cliente_id: A, nome_grupo: "Acelera A. – Aurora", contatos_marcar: ["Ana Paula", "Bruno"], ativo: true, observacao: null, removido_em: null, created_at: t, updated_at: t },
    { id: crypto.randomUUID(), envio_id: ENVIO, cliente_id: B, nome_grupo: "STG – Brisa", contatos_marcar: ["Carla - Brisa"], ativo: true, observacao: null, removido_em: null, created_at: t, updated_at: t },
  );
}

// ---------------------------------------------------------------- Admin: pop-up, decidir depois, aprovar
{
  const { browser, page, errors } = await launch();
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  db.envioAgora = SEG_0630;
  await login(page, "/");
  await page.waitForTimeout(1200);
  check(await page.getByTestId("envio-aprovacao").count() === 0, "antes das 7h: sem pop-up");

  db.envioAgora = SEG_0830;
  await page.goto(`${BASE}/`);
  const pop = page.getByTestId("envio-aprovacao");
  await pop.waitFor();
  const txt = await pop.innerText();
  check(txt.includes("Feedback semanal") && txt.includes("Acelera A. – Aurora") && txt.includes("@Ana Paula @Bruno") && txt.includes("STG – Brisa"),
    "pop-up mostra a mensagem, os grupos e quem marcar, na ordem");
  check((await pop.getByTestId("envio-preview").innerText()).includes("Como foi a semana?"), "pré-visualização da mensagem no pop-up");
  check(await pop.getByRole("button", { name: "Aprovar envio" }).isDisabled(), "aprovar só depois de marcar \"Analisei\"");
  await page.screenshot({ path: `${SHOTS}/envios-aprovacao.png` });

  // Decidir depois: some por 30 minutos; depois volta enquanto está no prazo
  await pop.getByRole("button", { name: "Decidir depois" }).click();
  await pop.waitFor({ state: "detached" });
  await page.reload();
  await page.waitForTimeout(1200);
  check(await page.getByTestId("envio-aprovacao").count() === 0, "\"Decidir depois\" esconde o pop-up por um tempo");
  await page.evaluate(() => { // passam 30 minutos
    const k = "ops.envios.depois";
    const v = JSON.parse(localStorage.getItem(k) ?? "{}");
    for (const key of Object.keys(v)) v[key] = Date.now() - 1;
    localStorage.setItem(k, JSON.stringify(v));
  });
  await page.reload();
  await page.getByTestId("envio-aprovacao").waitFor();
  check(db.opsEnvioAprovacoes.length === 0, "\"Decidir depois\" não registra decisão e o pop-up volta depois de 30 minutos");

  await page.getByTestId("envio-aprovacao").getByRole("checkbox").check();
  await page.getByTestId("envio-aprovacao").getByRole("button", { name: "Aprovar envio" }).click();
  await page.getByTestId("envio-aprovacao").waitFor({ state: "detached" });
  check(db.opsEnvioAprovacoes[0]?.decisao === "aprovado" && db.opsEnvioAprovacoes[0].versao_envio === 1 && db.opsEnvioAprovacoes[0].semana === "2026-11-02",
    "aprovação registrada para a semana, na versão vista");
  await page.goto(`${BASE}/operacoes/envios`);
  await page.getByTestId("envio-card").waitFor();
  check((await page.getByTestId("envio-card").innerText()).includes("Hoje: aprovado"), "card mostra \"Hoje: aprovado\"");
  check(await page.getByTestId("envio-aprovacao").count() === 0, "aprovado: o pop-up não volta");

  // Copiar comando agora leva o ID do envio e o pedido de registro pelo MCP
  await page.getByRole("button", { name: "Copiar comando de Feedback semanal" }).click();
  const cmd = await page.evaluate(() => navigator.clipboard.readText());
  check(cmd.includes(`backstage_registrar_execucao_envio (envio ${ENVIO})`), "comando copiado com o ID do envio para registrar pelo MCP");
  await page.getByRole("button", { name: "Copiar instrução da tarefa agendada" }).click();
  const instr = await page.evaluate(() => navigator.clipboard.readText());
  check(instr.includes("backstage_list_envios com liberados_agora = true") && instr.includes("Não abra o navegador"), "instrução da tarefa agendada copiada");

  // Editou depois de aprovar: pede aprovação de novo
  await page.getByRole("button", { name: "Editar Feedback semanal" }).click();
  await page.getByTestId("envio-form").getByLabel("Mensagem").fill("Bom dia! ☀️\nMudou a mensagem");
  await page.getByTestId("envio-form").getByRole("button", { name: "Salvar" }).click();
  await page.getByTestId("envio-aprovacao").waitFor();
  check((await page.getByTestId("envio-card").innerText()).includes("Hoje: aguardando sua aprovação"), "editou depois de aprovar: volta a pedir aprovação");
  await page.getByTestId("envio-aprovacao").getByRole("button", { name: "Não enviar esta semana" }).click();
  await page.getByTestId("envio-aprovacao").waitFor({ state: "detached" });
  check(db.opsEnvioAprovacoes[0].decisao === "recusado", "\"Não enviar esta semana\" fica registrado");
  check((await page.getByTestId("envio-card").innerText()).includes("Hoje: não enviar esta semana"), "card mostra a decisão");

  // Depois do horário: sem pop-up; histórico das aprovações
  db.envioAgora = SEG_1030;
  db.opsEnvioAprovacoes.length = 0;
  await page.reload();
  await page.getByTestId("envio-card").waitFor();
  await page.waitForTimeout(800);
  check(await page.getByTestId("envio-aprovacao").count() === 0 && (await page.getByTestId("envio-card").innerText()).includes("não aprovado a tempo"),
    "depois do horário sem aprovação: não sai e não pede mais");
  db.opsEnvioAprovacoes.push({ id: 9, envio_id: ENVIO, semana: "2026-10-26", decisao: "aprovado", versao_envio: 1, decidido_por: USER_ID,
    decidido_em: "2026-10-26T11:40:00Z", origem: "manual" }, { id: 10, envio_id: ENVIO, semana: "2026-11-02", decisao: "sem_resposta", versao_envio: 2,
    decidido_por: null, decidido_em: "2026-11-02T13:15:00Z", origem: "sistema" });
  await page.getByRole("button", { name: "Histórico" }).click();
  await page.getByTestId("envio-aprovacao-row").nth(1).waitFor();
  const ap = await page.getByTestId("envio-aprovacoes").innerText();
  check(ap.includes("02/11/2026") && ap.includes("Sem resposta (não saiu)") && ap.includes("Sistema (passou do horário)") && ap.includes("26/10/2026") && ap.includes("Aprovado"),
    "histórico mostra a decisão de cada semana");
  check(errors.length === 0, `sem erros no navegador ${errors.join(" | ")}`);
  await browser.close();
}

// ---------------------------------------------------------------- Equipe sem a permissão: sem pop-up
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "equipe" });
  seed(db);
  db.envioAgora = SEG_0830;
  db.opsMembers[USER_ID] = { primary: sectorId(db, "Design"), secondary: [], job_title: "Designer", active: true, joins_meetings: true, permissions: ["ops.access"] };
  await login(page, "/operacoes/minhas-tarefas");
  await page.getByTestId("ops-my-tasks").waitFor();
  await page.waitForTimeout(1200);
  check(await page.getByTestId("envio-aprovacao").count() === 0, "sem a permissão \"Envios semanais\": não recebe o pop-up");
  check(errors.length === 0, `sem erros (equipe) ${errors.join(" | ")}`);
  await browser.close();
}
console.log("Aprovação dos envios semanais (Etapa 41.2): tudo certo.");
