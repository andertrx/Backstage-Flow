import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Arquivos .env versionados vão para o site público: só podem ter valores públicos.
const webRoot = fileURLToPath(new URL("../..", import.meta.url));
const envFiles = readdirSync(webRoot).filter((f) => f.startsWith(".env"));

describe("arquivos .env do site", () => {
  it.each(envFiles)("%s não contém segredos", (file) => {
    const content = readFileSync(`${webRoot}/${file}`, "utf8")
      .split("\n")
      .filter((line) => !line.trim().startsWith("#"))
      .join("\n");
    expect(content).not.toMatch(/sb_secret_|service_role|SERVICE_ROLE|eyJhbGci|EAA[A-Za-z0-9]{20,}|GOCSPX-|refresh_token/);
    for (const line of content.split("\n").filter((l) => l.includes("="))) {
      expect(line.split("=")[0]).toMatch(/^VITE_SUPABASE_(URL|PUBLISHABLE_KEY)$/);
    }
  });
});
