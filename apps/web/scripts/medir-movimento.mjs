/**
 * Medição de movimento do CRM (27/11/2026) — mesma régua antes e depois de mexer nas animações.
 * Para cada tela e cada aparelho (computador 1440×900; iPhone com CPU 4× mais lenta):
 *   - ENTRADA: tempo de cada quadro (requestAnimationFrame) nos primeiros 1,5 s depois de abrir a tela;
 *   - ROLAGEM: tempo de cada quadro rolando a tela inteira;
 *   - animações rodando agora (document.getAnimations().length) logo após abrir a tela;
 *   - erros no console, imagens quebradas e rolagem horizontal.
 * Usa o servidor SIMULADO (nenhum dado real). Uso (com o site já em http://localhost:4173):
 *   E2E_BASE_URL=http://localhost:4173 CHROMIUM_PATH=... node scripts/medir-movimento.mjs resultado.json [repeticoes]
 * Atenção: o navegador de teste roda sem placa de vídeo, então vale comparar ANTES x DEPOIS na mesma máquina, não como valor absoluto.
 */
import { writeFileSync } from "node:fs";
import { chromium, devices } from "playwright";
import { createMockBackend, createMockDb } from "../src/demo/mockBackend.js";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:4173";
const SAIDA = process.argv[2] ?? "movimento.json";
const REPETICOES = Number(process.argv[3] ?? 3);
const PASSWORD = "Senha-certa-1";
const TELAS = [
  ["Login (3 s depois de abrir; rolagem = parado)", "/login"],
  ["Dashboard", "/"],
  ["Tracking", "/tracking"],
  ["Contatos", "/contatos"],
  ["Central de Operações", "/operacoes"],
];
// Login: sem entrar; conta também as animações 3 s depois de abrir (as que SEGUEM rodando são os loops eternos).
async function medirLogin(browser, aparelho) {
  const ctx = await browser.newContext({ ...aparelho.ctx, locale: "pt-BR" });
  const page = await ctx.newPage();
  const erros = [];
  page.on("pageerror", (e) => erros.push(e.message));
  await page.addInitScript(GRAVADOR);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: aparelho.cpu });
  await page.addInitScript(() => { window.__rec = true; });
  await page.goto(`${BASE}/login`);
  await page.waitForTimeout(1500);
  const entrada = await page.evaluate(() => { window.__rec = false; return window.__q.slice(); });
  const picoEntrada = await page.evaluate(() => window.__pico);
  await page.waitForTimeout(1600);
  const animacoes = await page.evaluate(() => {
    const todas = document.getAnimations(); const tipos = {};
    for (const a of todas) { const k = a.animationName ?? a.transitionProperty ?? "outra"; tipos[k] = (tipos[k] ?? 0) + 1; }
    return { total: todas.length, tipos, picoEntrada: 0 };
  });
  animacoes.picoEntrada = picoEntrada;
  await page.evaluate(() => { window.__q = []; window.__rec = true; });
  await page.waitForTimeout(1500);
  const parada = await page.evaluate(() => { window.__rec = false; return window.__q.slice(); });
  await ctx.close();
  const r = (q) => ({ quadros: q.length, mediana_ms: +mediana(q).toFixed(1), p95_ms: +p95(q).toFixed(1), acima_50ms: q.filter((x) => x > 50).length });
  return { entrada: r(entrada), rolagem: r(parada), animacoes_rodando: animacoes.total, animacoes_pico_entrada: animacoes.picoEntrada ?? null, animacoes_tipos: animacoes.tipos, erros_console: erros.length, imagensQuebradas: 0, rolagemHorizontal: false };
}

const APARELHOS = [
  { nome: "computador 1440×900", ctx: { viewport: { width: 1440, height: 900 } }, cpu: 1 },
  { nome: "iPhone (CPU 4× mais lenta)", ctx: { ...devices["iPhone 13"] }, cpu: 4 },
];

const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-expose-headers": "*" };
const mediana = (v) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const p95 = (v) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * 0.95))] : 0; };

// Gravador de quadros: guarda o tempo entre quadros enquanto "window.__rec" estiver ligado.
const GRAVADOR = `
  // O CRM desliga o movimento em navegador automatizado (public/theme-init.js). Aqui medimos COMO A PESSOA VÊ: movimento ligado.
  Object.defineProperty(navigator, "webdriver", { get: () => false });
  window.__q = []; window.__rec = false; window.__pico = 0; window.__tipos = {}; let ult = 0, n = 0;
  const f = (t) => {
    if (window.__rec && ult) window.__q.push(t - ult);
    if (window.__rec && ++n % 4 === 0) {
      const todas = document.getAnimations(); window.__pico = Math.max(window.__pico, todas.length);
      const c = {}; for (const a of todas) { const k = a.animationName ?? a.transitionProperty ?? "outra"; c[k] = (c[k] ?? 0) + 1; }
      for (const k in c) window.__tipos[k] = Math.max(window.__tipos[k] ?? 0, c[k]);
    }
    ult = t; requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
`;

async function medir(browser, aparelho, tela) {
  const ctx = await browser.newContext({ ...aparelho.ctx, locale: "pt-BR" });
  const page = await ctx.newPage();
  const erros = [];
  page.on("pageerror", (e) => erros.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") erros.push(m.text()); });
  const db = createMockDb({ role: "admin" });
  const handle = createMockBackend(db, { role: "admin", password: PASSWORD });
  await page.route("**/*.supabase.co/**", async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 200, headers: cors });
    const r = await handle({ url: req.url(), method: req.method(), body: req.postData() });
    return route.fulfill(r.body === undefined ? { status: r.status, headers: cors } : { status: r.status, headers: cors, contentType: "application/json", body: r.body });
  });
  await page.addInitScript(GRAVADOR);
  const cdp = await ctx.newCDPSession(page);
  // login (sem medir)
  await page.goto(`${BASE}/login`);
  await page.getByLabel("E-mail").fill("ander@teste.local");
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((u) => !u.pathname.includes("login"));
  await page.waitForTimeout(800);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: aparelho.cpu });

  // ENTRADA: troca de tela dentro do app (como a pessoa usa) e grava 1,5 s
  await page.evaluate(() => { window.__q = []; window.__pico = 0; window.__tipos = {}; window.__rec = true; });
  await page.evaluate((p) => { window.history.pushState({}, "", p); window.dispatchEvent(new PopStateEvent("popstate")); }, tela[1]);
  await page.waitForTimeout(1500);
  const entrada = await page.evaluate(() => { window.__rec = false; return window.__q.slice(); });
  const animacoes = await page.evaluate(() => ({ total: window.__pico, tipos: { ...window.__tipos } }));

  // ROLAGEM: desce a tela inteira em passos, gravando cada quadro
  await page.evaluate(() => { window.__q = []; window.__rec = true; });
  await page.evaluate(async () => {
    // a maior área rolável da tela: a própria página ou um painel interno
    let el = document.scrollingElement;
    let melhor = el.scrollHeight - el.clientHeight;
    for (const c of document.querySelectorAll("*")) {
      const o = getComputedStyle(c).overflowY;
      if ((o === "auto" || o === "scroll") && c.scrollHeight - c.clientHeight > melhor) { el = c; melhor = c.scrollHeight - c.clientHeight; }
    }
    const total = Math.max(0, melhor);
    const passo = Math.max(10, Math.round(total / 120));
    for (let y = 0; y <= total; y += passo) { el.scrollTop = y; await new Promise((r) => requestAnimationFrame(r)); }
    el.scrollTop = 0;
  });
  const rolagem = await page.evaluate(() => { window.__rec = false; return window.__q.slice(); });

  const saude = await page.evaluate(() => ({
    imagensQuebradas: [...document.images].filter((i) => i.complete && i.naturalWidth === 0).length,
    rolagemHorizontal: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  }));
  await ctx.close();
  const resumo = (q) => ({ quadros: q.length, mediana_ms: +mediana(q).toFixed(1), p95_ms: +p95(q).toFixed(1), acima_50ms: q.filter((x) => x > 50).length });
  return { entrada: resumo(entrada), rolagem: resumo(rolagem), animacoes_rodando: animacoes.total, animacoes_tipos: animacoes.tipos, erros_console: erros.length, ...saude };
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const saida = {};
for (const ap of APARELHOS) {
  saida[ap.nome] = {};
  for (const tela of TELAS) {
    const rodadas = [];
    for (let i = 0; i < REPETICOES; i++) rodadas.push(tela[1] === "/login" ? await medirLogin(browser, ap) : await medir(browser, ap, tela));
    const por = (f) => mediana(rodadas.map(f));
    saida[ap.nome][tela[0]] = {
      entrada: { mediana_ms: por((r) => r.entrada.mediana_ms), p95_ms: por((r) => r.entrada.p95_ms), acima_50ms: por((r) => r.entrada.acima_50ms), quadros: por((r) => r.entrada.quadros) },
      rolagem: { mediana_ms: por((r) => r.rolagem.mediana_ms), p95_ms: por((r) => r.rolagem.p95_ms), acima_50ms: por((r) => r.rolagem.acima_50ms), quadros: por((r) => r.rolagem.quadros) },
      animacoes_rodando: por((r) => r.animacoes_rodando),
      animacoes_pico_entrada: rodadas[0].animacoes_pico_entrada ?? null,
      animacoes_tipos: rodadas[0].animacoes_tipos,
      erros_console: Math.max(...rodadas.map((r) => r.erros_console)),
      imagens_quebradas: Math.max(...rodadas.map((r) => r.imagensQuebradas)),
      rolagem_horizontal: rodadas.some((r) => r.rolagemHorizontal),
    };
    console.log(ap.nome, "|", tela[0], JSON.stringify(saida[ap.nome][tela[0]]));
  }
}
await browser.close();
writeFileSync(SAIDA, JSON.stringify(saida, null, 2));
console.log("gravado em", SAIDA);
