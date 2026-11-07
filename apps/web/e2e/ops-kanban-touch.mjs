/**
 * Teste de navegador — arrastar cartões do Kanban com o DEDO (celular). Usa toques reais (CDP):
 * segurar um instante no cartão e arrastar até a coluna; um arrastar rápido continua rolando a página. Supabase SIMULADO.
 */
import { chromium } from "playwright";
import { BASE, check, mockSupabase, login, PASSWORD } from "./support.mjs";

const AURORA = "c1000000-0000-4000-8000-000000000001";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, locale: "pt-BR" });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const db = await mockSupabase(page, { role: "admin" });
db.clients.push({ id: AURORA, name: "Loja Aurora", company: null, status: "ativo", is_demo: false, timezone: "America/Sao_Paulo", created_at: "2026-09-20T12:00:00Z", updated_at: "", created_by: null });
const now = new Date().toISOString();
db.opsClientOps[AURORA] = { stage_id: "contrato_pago", am_user_id: null, started_at: now, stage_since: now, version: 1 };
await login(page, "/onboarding");
const card = page.locator("[data-testid=ops-kanban-column][data-status=contrato_pago] [data-testid=ops-kanban-card]").first();
await card.waitFor();
await card.scrollIntoViewIfNeeded();
const cdp = await ctx.newCDPSession(page);
const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });

// arrastar com o dedo: segura ~0,45 s no cartão e leva até a coluna ao lado (a borda dela já aparece na tela)
const target = page.locator("[data-testid=ops-kanban-column][data-status=onboarding_pendente]");
const a = await card.boundingBox();
const tb = await target.boundingBox();
const fromX = a.x + 100, fromY = a.y + 30;
const toX = Math.min(tb.x + 40, 300), toY = a.y + 40;
await touch("touchStart", fromX, fromY);
await page.waitForTimeout(450);
for (let i = 1; i <= 14; i++) { await touch("touchMove", fromX + ((toX - fromX) * i) / 14, fromY + ((toY - fromY) * i) / 14); await page.waitForTimeout(30); }
await page.waitForTimeout(200);
await touch("touchEnd", 0, 0);
for (let i = 0; i < 30 && db.opsClientOps[AURORA].stage_id === "contrato_pago"; i++) await page.waitForTimeout(100);
check(db.opsClientOps[AURORA].stage_id === "onboarding_pendente", `celular: arrastar com o dedo muda a coluna (${db.opsClientOps[AURORA].stage_id})`);

// um toque simples ainda abre o cartão
await page.reload();
const card2 = page.locator("[data-testid=ops-kanban-column][data-status=onboarding_pendente] [data-testid=ops-kanban-card]").first();
await card2.waitFor();
await card2.scrollIntoViewIfNeeded();
const c2 = await card2.boundingBox();
await page.touchscreen.tap(c2.x + c2.width / 2, c2.y + 20);
await page.getByTestId("ops-client-drawer").waitFor();
check(true, "celular: um toque simples continua abrindo o cartão");
check(errors.length === 0, `sem erros (${errors.join(" | ")})`);
await browser.close();
