#!/usr/bin/env node
/**
 * Etapa 26 — procura segredos no código versionado e no site gerado (dist).
 * Tokens, chaves secretas e senhas nunca podem estar no repositório nem no
 * que o navegador baixa. Uso: npm run check:secrets
 */
import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const PATTERNS = [
  ["chave secreta do Supabase", /sb_secret_[A-Za-z0-9_-]{10,}/],
  ["JWT (service_role/anon antigo)", /eyJhbGciOi[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/],
  ["token do Meta", /(?<![A-Za-z0-9+/])EAA[A-Za-z0-9]{40,}/],
  ["segredo OAuth do Google", /GOCSPX-[A-Za-z0-9_-]{10,}/],
  ["refresh token do Google", /1\/\/0[A-Za-z0-9_-]{30,}/],
  ["token de acesso do Google", /ya29\.[A-Za-z0-9_-]{30,}/],
  ["chave privada", /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["service_role atribuída", /SERVICE_ROLE_KEY\s*=\s*['"]?[A-Za-z0-9._-]{20,}/],
];

// Arquivos de teste e imagens embutidas (base64) geram falsos positivos.
const SKIP = [/\.(png|jpe?g|gif|ico|woff2?|svg)$/i, /package-lock\.json$/, /(^|\/)e2e\//, /_test\.ts$/, /\.test\.ts$/, /supabase\/tests\//, /scripts\/check-secrets\.mjs$/];

const tracked = execSync("git ls-files", { encoding: "utf8" }).split("\n").filter(Boolean);
const dist = "apps/web/dist";
const built = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(js|html|css|json)$/.test(p)) built.push(p);
  }
};
if (existsSync(dist)) walk(dist);

const problems = [];
for (const file of [...tracked.filter((f) => !SKIP.some((s) => s.test(f))), ...built]) {
  if (!existsSync(file)) continue;
  const text = readFileSync(file, "utf8");
  for (const [label, re] of PATTERNS) if (re.test(text)) problems.push(`${file}: ${label}`);
}

console.log(`Arquivos verificados: ${tracked.length} do repositório + ${built.length} do site gerado.`);
if (problems.length) {
  console.error("SEGREDOS ENCONTRADOS:\n" + problems.map((p) => `  - ${p}`).join("\n"));
  process.exit(1);
}
console.log("Nenhum segredo encontrado.");
