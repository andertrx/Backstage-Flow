import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 25/11/2026 — a tabela tracking_whatsapp_connections tem colunas secretas, então o site só lê coluna a coluna (grant select (col)).
 * Quando alguém pede uma coluna nova na consulta do site e esquece a permissão, a consulta INTEIRA falha e os botões do WhatsApp param.
 * Este teste confere que toda coluna pedida em useWhatsAppConnections tem um "grant select" em alguma migration.
 */
const root = new URL("../../../../", import.meta.url).pathname;
const api = readFileSync(`${root}apps/web/src/features/tracking/api.ts`, "utf8");
const migrations = readdirSync(`${root}supabase/migrations`).map((f) => readFileSync(`${root}supabase/migrations/${f}`, "utf8")).join("\n");

describe("colunas de tracking_whatsapp_connections lidas pelo site", () => {
  const trecho = api.slice(api.indexOf("useWhatsAppConnections"));
  const colunas = /\.from\("tracking_whatsapp_connections"\)\s*\.select\("([^"]+)"\)/.exec(trecho)?.[1].split(",").map((c) => c.trim()) ?? [];

  it("a consulta foi encontrada", () => expect(colunas.length).toBeGreaterThan(10));

  it.each(colunas)("a coluna %s tem permissão de leitura (grant select) em alguma migration", (col) => {
    const comGrant = [...migrations.matchAll(/grant\s+select\s*\(([^)]+)\)\s+on\s+(?:public\.)?tracking_whatsapp_connections\s+to\s+authenticated/gi)]
      .flatMap((m) => m[1].split(",").map((c) => c.trim()));
    const tabelaToda = /grant\s+select\s+on\s+(?:public\.)?tracking_whatsapp_connections\s+to\s+authenticated/i.test(migrations);
    expect(tabelaToda || comGrant.includes(col)).toBe(true);
  });
});
