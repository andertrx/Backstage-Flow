/**
 * Teste de navegador da Etapa 31 — Responsividade.
 * Usa o modo demonstração (dados fictícios, tudo no navegador) para abrir TODAS
 * as telas em 4 tamanhos: celular, tablet, notebook e desktop.
 * Em cada tela confere: sem rolagem lateral da página, tabelas largas com
 * rolagem própria, gráficos dentro da tela e o menu lateral certo para o tamanho.
 */
import { BASE, check, launch, SHOTS } from "./support.mjs";

const SIZES = { celular: [390, 844], tablet: [768, 1024], notebook: [1280, 800], desktop: [1920, 1080] };
const ROUTES = ["/", "/executivo", "/comparar", "/historico", "/clientes", "@cliente", "/contas", "/meta-ads", "/google-ads",
  "/campanhas", "@campanha", "/relatorios", "/alertas", "/sincronizacao", "/logs", "/configuracoes", "/usuarios",
  "/integracoes", "/permissoes", "/minha-conta"];

const { browser, page, errors } = await launch();
await page.goto(`${BASE}/demo`);
await page.getByTestId("demo-banner").waitFor({ timeout: 15000 });

async function open(path) {
  await page.goto(`${BASE}${path}`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("heading", { level: 1 }).first().waitFor();
  await page.waitForTimeout(400);
}

// Endereços de um cliente e de uma campanha da demonstração
await open("/clientes");
const clientHref = await page.locator('main a[href^="/clientes/"]').first().getAttribute("href");
await open("/campanhas");
await page.locator('main a[href^="/campanhas/"]').first().waitFor();
const campaignHref = await page.locator('main a[href^="/campanhas/"]').first().getAttribute("href");

/** O que passa da largura da tela sem estar dentro de uma caixa com rolagem. */
const layoutProblems = () => page.evaluate(() => {
  const doc = document.documentElement;
  const vw = doc.clientWidth;
  const insideScroll = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      if (/(auto|scroll|hidden)/.test(getComputedStyle(p).overflowX)) return true;
    }
    return false;
  };
  const out = [];
  if (doc.scrollWidth > doc.clientWidth) out.push(`página rola para o lado (${doc.scrollWidth - doc.clientWidth}px)`);
  for (const t of document.querySelectorAll("main table")) {
    if (t.getBoundingClientRect().width > vw && !insideScroll(t)) out.push("tabela larga sem rolagem própria");
  }
  for (const g of document.querySelectorAll("main svg[role=img]")) {
    if (g.getBoundingClientRect().right > vw + 1) out.push("gráfico passa da tela");
  }
  for (const el of document.querySelectorAll("main *")) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.right > vw + 1 && !insideScroll(el) && getComputedStyle(el).position !== "fixed") {
      out.push(`${el.tagName.toLowerCase()} passa da tela`);
      break;
    }
  }
  return out;
});
const sidebarVisible = () => page.evaluate(() => {
  const nav = document.querySelector('aside nav[aria-label="Menu principal"]');
  if (!nav) return false;
  const r = nav.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
});

// 1) Todas as telas, nos 4 tamanhos
for (const [size, [w, h]] of Object.entries(SIZES)) {
  await page.setViewportSize({ width: w, height: h });
  const problems = [];
  let sidebarOk = true;
  for (const r of ROUTES) {
    const path = r === "@cliente" ? clientHref : r === "@campanha" ? campaignHref : r;
    await open(path);
    for (const p of await layoutProblems()) problems.push(`${path}: ${p}`);
    if ((await sidebarVisible()) !== (w >= 1024)) sidebarOk = false;
  }
  check(problems.length === 0, `${size} (${w}px): ${ROUTES.length} telas sem nada saindo da tela ${problems.slice(0, 3).join(" | ")}`);
  check(sidebarOk, `${size}: menu lateral ${w >= 1024 ? "fixo à esquerda" : "escondido (abre pelo botão)"}`);
}

// 2) Celular: menu lateral adaptável
await page.setViewportSize({ width: 390, height: 844 });
await open("/");
await page.screenshot({ path: `${SHOTS}/310-celular-dashboard.png` });
await page.getByRole("button", { name: "Abrir menu" }).click();
const drawer = page.getByRole("dialog", { name: "Menu" });
await drawer.waitFor();
check(await drawer.getByRole("link", { name: "Campanhas" }).isVisible(), "celular: botão abre o menu com todas as telas");
await page.screenshot({ path: `${SHOTS}/311-celular-menu.png` });
await drawer.getByRole("link", { name: "Campanhas" }).click();
await page.getByRole("heading", { name: "Campanhas", level: 1 }).waitFor();
check(await drawer.count() === 0, "celular: ao escolher uma tela o menu fecha sozinho");

// 3) Celular: filtros recolhidos atrás do botão "Filtros"
await open("/");
const toggle = page.getByTestId("filters-toggle");
check(await toggle.isVisible() && !(await page.getByLabel("Cliente").isVisible()), "celular: filtros recolhidos (números aparecem na primeira tela)");
check((await page.getByTestId("period-text").innerText()).length > 0, "celular: o período escolhido continua visível");
const kpiTop = (await page.getByRole("group", { name: "Investimento", exact: true }).boundingBox()).y;
check(kpiTop < 844, `celular: primeiro número visível sem rolar (${Math.round(kpiTop)}px)`);
await toggle.click();
await page.getByLabel("Cliente").selectOption({ index: 1 });
await page.waitForURL((u) => u.searchParams.has("cliente"));
await page.waitForFunction(() => document.querySelector("[data-testid=filters-toggle]")?.textContent?.includes("1 ativo"), null, { timeout: 5000 }).catch(() => {});
const toggleText = (await toggle.innerText()).replace(/\s+/g, " ");
check(toggleText.includes("1 ativo"), `celular: botão mostra quantos filtros estão ativos (${toggleText})`);

// 4) Celular: cards empilhados (no máximo 2 por linha; a cadeia executiva 1 por linha)
const perRow = (selector) => page.evaluate((sel) => {
  const tops = [...document.querySelectorAll(sel)].map((e) => Math.round(e.getBoundingClientRect().top));
  const counts = {};
  for (const t of tops) counts[t] = (counts[t] ?? 0) + 1;
  return Math.max(0, ...Object.values(counts));
}, selector);
check(await perRow("main [role=group][aria-label]") <= 2, "celular: cards do Dashboard em no máximo 2 colunas");
await open("/executivo");
check(await perRow("[data-testid=executive-chain] [role=group]") === 1, "celular: cadeia da visão executiva um card por linha");

// 5) Tabelas com rolagem lateral própria (a página não rola)
await open("/campanhas");
const tableScroll = await page.evaluate(() => {
  const t = document.querySelector("main table");
  if (!t) return null;
  let p = t.parentElement;
  while (p && !/(auto|scroll)/.test(getComputedStyle(p).overflowX)) p = p.parentElement;
  return p ? { box: p.clientWidth, content: p.scrollWidth } : null;
});
check(tableScroll == null || tableScroll.content >= tableScroll.box, "celular: tabela de campanhas rola dentro da própria caixa");

// 6) Gráfico se ajusta à largura
await open("/");
const chart = await page.evaluate(() => {
  const svg = document.querySelector("main svg[role=img]");
  return svg ? { w: svg.getBoundingClientRect().width, vw: document.documentElement.clientWidth } : null;
});
check(chart != null && chart.w <= chart.vw && chart.w > 250, `celular: gráfico ocupa a largura disponível (${Math.round(chart?.w ?? 0)}px)`);

// 7) Tablet: filtros abertos, sem botão
await page.setViewportSize({ width: 768, height: 1024 });
await open("/");
check(!(await page.getByTestId("filters-toggle").isVisible()) && await page.getByLabel("Cliente").isVisible(), "tablet: filtros sempre visíveis");
await page.screenshot({ path: `${SHOTS}/312-tablet-dashboard.png` });

check(errors.length === 0, "nenhum erro no navegador: " + errors.join(" | "));
await browser.close();
console.log("\nTodos os testes de responsividade passaram.");
