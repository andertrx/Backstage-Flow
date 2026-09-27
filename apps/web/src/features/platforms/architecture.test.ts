// Etapa 28: garante que o site continua pronto para novas plataformas.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { PLATFORMS } from "@backstage/shared";
import { describe, expect, it } from "vitest";
import { NAV_ITEMS } from "@/components/layout/navigation.ts";
import { clientShortcuts } from "@/features/search/logic.ts";
import { platformLook } from "./look.ts";
import { PLATFORM_VIEW_LIST, PLATFORM_VIEWS } from "./logic.ts";

const SRC = fileURLToPath(new URL("../..", import.meta.url));

/**
 * Únicos arquivos que podem citar uma plataforma pelo id: o jeito de CONECTAR
 * é próprio de cada uma (token do Meta, login do Google) e a aparência (ícone).
 */
const PLATFORM_SPECIFIC = new Set([
  "features/platforms/look.ts",
  "features/integrations/IntegrationsPage.tsx",
  "features/integrations/MetaIntegrationCard.tsx",
  "features/integrations/GoogleIntegrationCard.tsx",
  "features/integrations/GoogleCallbackPage.tsx",
  "features/integrations/ConnectionAccountsModal.tsx",
  "features/ad-accounts/api.ts",
]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "demo" ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : [];
  });
}

describe("arquitetura preparada para novas plataformas", () => {
  it("nenhuma tela escreve \"meta\"/\"google\" fixo (usa o catálogo)", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const rel = relative(SRC, file).replaceAll("\\", "/");
      if (PLATFORM_SPECIFIC.has(rel)) continue;
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (/["'`](meta|google)["'`]/.test(line) && !/^\s*(\/\/|\*)/.test(line)) offenders.push(`${rel}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it("cada plataforma do catálogo tem tela, item no menu e atalho na busca", () => {
    expect(PLATFORM_VIEW_LIST.map((v) => v.id)).toEqual(PLATFORMS.map((p) => p.id));
    for (const p of PLATFORMS) {
      expect(PLATFORM_VIEWS[p.id].label).toBe(p.name);
      expect(NAV_ITEMS.some((n) => n.path === p.path && n.label === p.name)).toBe(true);
      expect(clientShortcuts("c1", "admin").some((s) => s.href.startsWith(`${p.path}?`))).toBe(true);
    }
  });

  it("a ordem do menu não mudou", () => {
    expect(NAV_ITEMS.map((n) => n.label)).toEqual([
      "Dashboard", "Clientes", "Contas", "Meta Ads", "Google Ads", "Campanhas",
      "Relatórios", "Alertas", "Tracking (em construção)", "Sincronização", "Logs", "Configurações",
    ]);
  });

  it("plataforma sem visual próprio usa o visual neutro", () => {
    expect(platformLook("tiktok").icon).toBeTruthy();
    expect(platformLook("tiktok").className).toContain("slate");
  });
});
