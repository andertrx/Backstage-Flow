/**
 * Teste de navegador da correção de 13/10/2026 — saldo PIX informado no CRM.
 * Conta com cartão cadastrado (o Meta informa só o cartão), mas as campanhas rodam com PIX:
 * o disponível vem das recargas informadas no CRM, descontado o gasto que o Meta informa depois.
 * Supabase SIMULADO (support.mjs).
 */
import { BASE, check, launch, login, mockSupabase, SHOTS } from "./support.mjs";

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const day = (offset) => new Date(Date.parse(`${today}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);
const M = 1_000_000;
const KIDS = "e0000000-0000-4000-8000-000000000031";
const PIX = "a0000000-0000-4000-8000-000000000731";
const CARD = "a0000000-0000-4000-8000-000000000732";

function seed(db) {
  const client = (id, name) => ({ id, name, company: null, cnpj: null, owner_name: null, phone: null, email: null, notes: null, status: "ativo", timezone: "America/Sao_Paulo", is_demo: false, created_at: "", updated_at: "", created_by: null });
  db.clients.push(client(KIDS, "Estilo de Ser"));
  const account = (id, external_id, name, extra = {}) => ({ id, platform_id: "meta", external_id, client_id: KIDS, name, currency: "BRL", status: "ativa", unlinked_at: null, ...extra });
  db.adAccounts.push(
    account(PIX, "731", "CA - Kids PIX", { manual_prepaid: true }),
    account(CARD, "732", "CA - Adulto Cartão"),
  );
  const cardSnap = {
    captured_at: new Date(Date.now() - 3600_000).toISOString(), available_micros: null, available_basis: "meta_card",
    amount_spent_micros: 7521.5 * M, amount_due_micros: 21.76 * M, funding_description: "Mastercard *2039", issues: [],
  };
  db.snapshots[PIX] = { ...cardSnap };
  db.snapshots[CARD] = { ...cardSnap, funding_description: "Visa *1111" };
  // Gasto: R$ 50 por dia nos 2 últimos dias (média R$ 50/dia) e R$ 20 hoje antes da recarga.
  for (const [d, v] of [[-2, 50], [-1, 50], [0, 20]]) {
    db.metrics.push({ date: day(d), ad_account_id: PIX, level: "account", campaign_id: null, client_id: KIDS, platform_id: "meta", currency: "BRL", spend_micros: v * M, impressions: 0, clicks: 0 });
  }
}

const clean = (s) => s.replace(/ /g, " ");
const card = (page, name) => page.getByRole("group", { name: `Saldo ${name}`, exact: true });
const text = async (locator) => clean(await locator.innerText());

// ------------------------------------------------------------ administrador
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "admin" });
  seed(db);
  await login(page, "/");
  await card(page, "CA - Kids PIX").waitFor();
  const pix = card(page, "CA - Kids PIX");

  // Antes de informar: nada inventado (nem R$ 0,00 do cartão).
  await pix.getByTestId("manual-pix").waitFor();
  let t = await text(pix);
  check(clean(await pix.getByTestId("balance-available").innerText()) === "—", "sem recarga informada: disponível —, não R$ 0,00");
  check(await pix.getByTestId("payment-badge").getAttribute("data-kind") === "pre_pago_informado" && t.includes("Saldo PIX informado no CRM"),
    "etiqueta: saldo PIX informado no CRM (não 'Cartão de crédito')");
  check(t.includes("Nenhuma recarga informada ainda") && t.includes("Mastercard *2039"), "explica que o Meta só informa o cartão");
  check(!t.includes("Pago no cartão: sem saldo em conta.") && !t.includes("Sem saldo"), "sem o aviso de cartão e sem alerta falso");

  // A outra conta (sem marcação) continua como cartão.
  const other = card(page, "CA - Adulto Cartão");
  check(clean(await other.getByTestId("balance-available").innerText()) === "R$ 0,00"
    && await other.getByTestId("payment-badge").getAttribute("data-kind") === "cartao"
    && await other.getByTestId("manual-pix").count() === 0, "outra conta do mesmo cliente não muda (cartão, R$ 0,00)");

  // Registrar recarga PIX de R$ 500.
  await pix.getByTestId("manual-pix-add").click();
  const modal = page.getByRole("dialog", { name: "Registrar recarga PIX" });
  await modal.getByLabel(/Valor/).fill("abc");
  await modal.getByRole("button", { name: "Registrar" }).click();
  await modal.getByText("Informe um valor válido.").waitFor();
  check(true, "valida o valor");
  await modal.getByLabel(/Valor/).fill("500,00");
  await modal.getByLabel("Observação").fill("PIX de outubro");
  await modal.getByRole("button", { name: "Registrar" }).click();
  await modal.waitFor({ state: "detached" });
  await pix.getByTestId("balance-available").getByText("R$ 500,00").waitFor();
  check(db.manualBalance.length === 1 && db.manualBalance[0].amount_micros === 500 * M && db.manualBalance[0].day_spend_before_micros === 20 * M,
    "recarga salva com o gasto de hoje até agora (não é descontado)");
  t = await text(pix);
  check(t.includes("cerca de 10 dias") && !t.includes("Saldo baixo"), "previsão de duração: R$ 500 ÷ R$ 50/dia");

  // O Meta informa mais R$ 30 gastos hoje → disponível R$ 470.
  db.metrics.find((m) => m.ad_account_id === PIX && m.date === day(0)).spend_micros += 30 * M;
  await page.reload();
  await card(page, "CA - Kids PIX").getByTestId("balance-available").getByText("R$ 470,00").waitFor();
  t = await text(card(page, "CA - Kids PIX"));
  check(t.includes("recargas R$ 500,00") && t.includes("gasto R$ 30,00") && t.includes("= R$ 470,00"), "mostra a conta: recargas − gasto = disponível");
  await card(page, "CA - Kids PIX").screenshot({ path: `${SHOTS}/correcao-saldo-pix.png` });

  // Saldo atual conferido no Meta vira a nova partida.
  await card(page, "CA - Kids PIX").getByTestId("manual-pix-add").click();
  await modal.getByLabel("O que você vai informar").selectOption("saldo");
  await modal.getByLabel(/Valor/).fill("1.234,56");
  await modal.getByRole("button", { name: "Registrar" }).click();
  await card(page, "CA - Kids PIX").getByTestId("balance-available").getByText("R$ 1.234,56").waitFor();
  check(true, "saldo atual (conferido no Meta) substitui a conta anterior");

  // Cancelar o registro errado: volta para R$ 470 e fica no histórico como cancelado.
  const first = card(page, "CA - Kids PIX").getByTestId("manual-pix-entry").first();
  await first.getByRole("button", { name: "Cancelar" }).click();
  await first.getByRole("button", { name: "Sim, cancelar" }).click();
  await card(page, "CA - Kids PIX").getByTestId("balance-available").getByText("R$ 470,00").waitFor();
  await first.getByText("Cancelado").waitFor();
  check(db.manualBalance.length === 2 && db.manualBalance[1].voided_at != null, "cancelado não é apagado");

  // Gasto maior que o saldo → R$ 0,00 e alerta "Sem saldo".
  db.metrics.find((m) => m.ad_account_id === PIX && m.date === day(0)).spend_micros += 600 * M;
  await page.reload();
  await card(page, "CA - Kids PIX").getByTestId("balance-available").getByText("R$ 0,00").waitFor();
  check((await text(card(page, "CA - Kids PIX"))).includes("Sem saldo"), "saldo acabou → alerta Sem saldo");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => document.documentElement.scrollWidth <= window.innerWidth, null, { timeout: 3000 }).catch(() => {});
  check(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), "no celular não há rolagem para o lado");

  check(errors.length === 0, `sem erros no navegador ${errors.join(" | ")}`);
  await browser.close();
}

// ------------------------------------------------------------ visualizador: só vê
{
  const { browser, page, errors } = await launch();
  const db = await mockSupabase(page, { role: "visualizador" });
  seed(db);
  db.manualBalance = [{ id: 1, ad_account_id: PIX, kind: "recarga", amount_micros: 300 * M, entered_at: new Date(Date.now() - 3600_000).toISOString(),
    account_day: day(0), day_spend_before_micros: 20 * M, note: null, created_by: null, voided_at: null, void_reason: null }];
  await login(page, "/");
  await card(page, "CA - Kids PIX").getByTestId("balance-available").getByText("R$ 300,00").waitFor();
  check(await page.getByTestId("manual-pix-add").count() === 0 && await page.getByRole("button", { name: "Cancelar" }).count() === 0,
    "visualizador vê o saldo informado, mas não registra nem cancela");
  check(errors.length === 0, "sem erros no navegador (visualizador)");
  await browser.close();
}

console.log(`\nSaldo PIX informado: tudo certo (${BASE}).`);
