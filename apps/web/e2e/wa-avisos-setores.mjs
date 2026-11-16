/** Avisos no WhatsApp por setor (Integrações): um grupo por setor, avisos próprios de cada um. Supabase e servidor SIMULADOS. */
import { check, launch, login, mockSupabase, SHOTS } from "./support.mjs";

const t = "2026-10-27T12:00:00Z";
const GD = "120363000000000071@g.us", GG = "120363000000000072@g.us";
function seed(db) {
  Object.assign(db.waGw, { base_url: "https://whats.exemplo.com.br", has_key: true, risk_accepted_at: t, enabled: true, connection_state: "conectado" });
  db.waSim.state = "open";
  db.waSim.groups = [{ id: GD, name: "Design Backstage", size: 3 }, { id: GG, name: "Gestores Backstage", size: 2 }];
}

{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  db.opsSectors.find((x) => x.name === "Atendimento").status = "arquivado";
  await login(page, "/configuracoes/integracoes");
  const card = page.getByTestId("wa-avisos-setores-card");
  await card.waitFor();
  const nomes = db.opsSectors.filter((s) => s.status === "ativo").map((s) => s.name);
  for (const n of nomes) check(await card.getByTestId(`wa-setor-${n}`).count() === 1, `o setor ${n} aparece na lista`);
  check(await card.getByTestId("wa-setor-Atendimento").count() === 0, "setor arquivado não aparece");

  // opções certas em cada setor
  const design = card.getByTestId("wa-setor-Design");
  check(await design.getByLabel("Tarefa nova no setor").count() === 1 && await design.getByLabel("Tarefa concluída").count() === 1, "Design tem as tarefas do setor");
  check(await design.getByLabel("Casos críticos de campanhas").count() === 0 && await design.getByLabel("Lead novo").count() === 0 && await design.getByLabel("Cliente mudou de etapa").count() === 0, "Design não vê campanhas, leads nem onboarding");
  const gestor = card.getByTestId("wa-setor-Gestão de Tráfego");
  check(await gestor.getByLabel("Casos críticos de campanhas").count() === 1 && await gestor.getByLabel("Tarefa atrasada").count() === 1, "Gestão de Tráfego vê campanhas e tarefas");
  check(await gestor.getByLabel(/Cliente sem gastar/).count() === 0, "o 'cliente sem gastar' continua só no grupo principal");
  check(await card.getByTestId("wa-setor-Comercial").getByLabel("Lead novo").count() === 1 && await card.getByTestId("wa-setor-Comercial").getByLabel("Casos críticos de campanhas").count() === 0, "só o Comercial vê leads");
  check(await card.getByTestId("wa-setor-Account Manager").getByLabel("Cliente mudou de etapa").count() === 1 && await design.getByLabel("Cliente entrou no fluxo do onboarding").count() === 0, "só o Account Manager vê o onboarding");

  // ligar sem grupo é recusado
  await design.getByRole("switch", { name: "Ligar avisos do setor Design" }).click();
  await design.getByRole("button", { name: "Salvar avisos do setor Design" }).click();
  await design.getByText("Escolha o grupo do setor antes de ligar.").waitFor();
  check(db.waAvisosSetores.length === 0, "sem grupo, nada é salvo");

  // escolhe grupos e salva
  await card.getByRole("button", { name: "Buscar grupos no WhatsApp" }).click();
  await design.getByLabel("Grupo do setor Design").selectOption(GD);
  await design.getByLabel("Tarefa nova no setor").check();
  await design.getByLabel("Tarefa concluída").check();
  await design.getByRole("button", { name: "Salvar avisos do setor Design" }).click();
  await design.getByText("Salvo.").waitFor();
  await gestor.getByLabel("Grupo do setor Gestão de Tráfego").selectOption(GG);
  await gestor.getByRole("switch", { name: "Ligar avisos do setor Gestão de Tráfego" }).click();
  await gestor.getByLabel("Casos críticos de campanhas").check();
  await gestor.getByLabel("Tarefa atrasada").check();
  await gestor.getByRole("button", { name: "Salvar avisos do setor Gestão de Tráfego" }).click();
  await gestor.getByText("Salvo.").waitFor();
  const d = db.waAvisosSetores.find((x) => x.grupo_id === GD), g = db.waAvisosSetores.find((x) => x.grupo_id === GG);
  check(d?.ativo === true && JSON.stringify(d.tipos) === '["st:tarefa.nova","st:tarefa.concluida"]', "Design salvo com o grupo e as 2 tarefas");
  check(g?.ativo === true && g.tipos.includes("campanha_critica") && g.tipos.includes("st:tarefa.atrasada"), "Gestão de Tráfego salva com campanhas e tarefas");
  check(JSON.stringify(db.waAvisosCfg.tipos).includes("campanha_critica") === false, "o grupo principal (do administrador) não mudou");
  await page.screenshot({ path: `${SHOTS}/wa-avisos-setores.png`, fullPage: false });
  // recarrega: o que foi salvo continua
  await page.reload();
  const design2 = page.getByTestId("wa-avisos-setores-card").getByTestId("wa-setor-Design");
  await design2.waitFor();
  check(await design2.getByLabel("Tarefa concluída").isChecked(), "depois de recarregar, os avisos escolhidos continuam");
  check(errors.length === 0, `sem erros (${errors.join(" | ")})`);
  await browser.close();
}
{
  const { browser, page } = await launch();
  const db = await mockSupabase(page, { role: "gestor" });
  seed(db);
  await login(page, "/configuracoes/integracoes");
  await page.waitForTimeout(1500);
  check(await page.getByTestId("wa-avisos-setores-card").count() === 0, "gestor não vê os avisos por setor");
  await browser.close();
}
console.log("OK: wa-avisos-setores");
