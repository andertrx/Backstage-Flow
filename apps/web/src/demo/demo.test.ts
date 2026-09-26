import { afterEach, describe, expect, it, vi } from "vitest";
import { DEMO_BLOCKED_MESSAGE, demoFetch } from "./demoFetch.ts";
import { DEMO_SUFFIX, seedDemo } from "./seed.ts";

type Row = Record<string, unknown>;

describe("dados fictícios do modo demonstração", () => {
  const db = seedDemo();

  it("todo cliente e conta está claramente marcado como demonstração", () => {
    expect(db.clients.length).toBeGreaterThanOrEqual(4);
    for (const c of db.clients) {
      expect(String(c.name).endsWith(DEMO_SUFFIX)).toBe(true);
      expect(c.is_demo).toBe(true);
      expect(String(c.id).startsWith("de000000-")).toBe(true);
    }
    for (const a of db.adAccounts) {
      expect(String(a.name)).toContain(DEMO_SUFFIX);
      expect(a.is_demo).toBe(true);
    }
  });

  it("tem mais de uma moeda (para mostrar que nunca são somadas)", () => {
    expect(new Set(db.adAccounts.map((a) => a.currency))).toEqual(new Set(["BRL", "USD"]));
  });

  it("o total da conta em cada dia é a soma das campanhas", () => {
    const account = db.adAccounts[0] as Row;
    const byLevel = (level: string) => db.metrics.filter((m) => m.level === level && m.ad_account_id === account.id) as Row[];
    const accountDays = byLevel("account");
    expect(accountDays.length).toBeGreaterThan(300); // 13 meses de histórico
    const day = accountDays[accountDays.length - 10];
    const campaigns = byLevel("campaign").filter((m) => m.date === day.date);
    const sum = campaigns.reduce((t, m) => t + Number(m.spend_micros), 0);
    expect(day.spend_micros).toBe(sum);
  });

  it("anúncios somam o conjunto e conjuntos somam a campanha", () => {
    const campaign = db.metrics.find((m) => m.level === "campaign") as Row;
    const groups = db.metrics.filter((m) => m.level === "ad_group" && m.campaign_id === campaign.campaign_id && m.date === campaign.date) as Row[];
    expect(groups.reduce((t, m) => t + Number(m.clicks), 0)).toBe(campaign.clicks);
    const ads = db.metrics.filter((m) => m.level === "ad" && m.ad_group_id === groups[0].ad_group_id && m.date === campaign.date) as Row[];
    expect(ads.reduce((t, m) => t + Number(m.clicks), 0)).toBe(groups[0].clicks);
  });

  it("não inventa dados de hoje (o dia ainda não fechou)", () => {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
    expect(db.metrics.some((m) => m.date === today)).toBe(false);
  });

  it("sempre gera os mesmos números", () => {
    expect(seedDemo().metrics.slice(0, 20)).toEqual(db.metrics.slice(0, 20));
  });
});

describe("servidor da demonstração", () => {
  afterEach(() => vi.restoreAllMocks());

  it("responde no navegador, sem nenhuma chamada de rede", async () => {
    const network = vi.spyOn(globalThis, "fetch");
    const res = await demoFetch("https://demonstracao.supabase.co/rest/v1/clients?select=*", { method: "GET" });
    expect(res.status).toBe(200);
    const clients = (await res.json()) as Row[];
    expect(clients.every((c) => String(c.name).endsWith(DEMO_SUFFIX))).toBe(true);
    expect(network).not.toHaveBeenCalled();
  });

  it("bloqueia ações que mexeriam em contas reais ou usuários", async () => {
    for (const [fn, body] of [
      ["ad-accounts", { action: "connect", platform: "meta", label: "x", accessToken: "EAA..." }],
      ["ad-accounts", { action: "google_start" }],
      ["ad-accounts", { action: "link" }],
      ["admin-users", { action: "create" }],
    ] as const) {
      const res = await demoFetch(`https://demonstracao.supabase.co/functions/v1/${fn}`, { method: "POST", body: JSON.stringify(body) });
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: { message: string } }).error.message).toBe(DEMO_BLOCKED_MESSAGE);
    }
  });

  it("aceita a entrada do usuário fictício", async () => {
    const res = await demoFetch("https://demonstracao.supabase.co/auth/v1/token?grant_type=password", {
      method: "POST",
      body: JSON.stringify({ email: "demonstracao@backstage.local", password: "qualquer" }),
    });
    expect(res.status).toBe(200);
  });
});
