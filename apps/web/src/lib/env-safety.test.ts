import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Configurações versionadas vão para o site público: só podem ter valores públicos.
const webRoot = fileURLToPath(new URL("../..", import.meta.url));
const files = readdirSync(webRoot).filter((f) => f.startsWith(".env") || f.startsWith("public-config"));
const SECRET = /sb_secret_|service_role|SERVICE_ROLE|eyJhbGci|EAA[A-Za-z0-9]{20,}|GOCSPX-|refresh_token/;

describe("configuração pública do site", () => {
  it("existe a configuração de produção", () => {
    expect(files).toContain("public-config.production.json");
  });

  it.each(files)("%s não contém segredos nem chaves fora da lista", (file) => {
    const raw = readFileSync(`${webRoot}/${file}`, "utf8");
    if (file.endsWith(".json")) {
      const data = JSON.parse(raw) as Record<string, string>;
      const keys = Object.keys(data).filter((k) => !k.startsWith("_"));
      expect(keys.sort()).toEqual(["VITE_SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_URL"]);
      for (const k of keys) expect(data[k]).not.toMatch(SECRET);
      expect(data.VITE_SUPABASE_PUBLISHABLE_KEY).toMatch(/^sb_publishable_/);
      return;
    }
    const content = raw.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");
    expect(content).not.toMatch(SECRET);
    for (const line of content.split("\n").filter((l) => l.includes("="))) {
      expect(line.split("=")[0]).toMatch(/^VITE_SUPABASE_(URL|PUBLISHABLE_KEY)$/);
    }
  });
});
