import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv } from "vite";

const PUBLIC_KEYS = ["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"] as const;

/**
 * Em produção, se a Vercel não tiver as variáveis, usa os valores PÚBLICOS de
 * public-config.production.json (a Vercel descarta arquivos .env do repositório).
 */
function productionDefaults(mode: string): Record<string, string> {
  if (mode !== "production") return {};
  const env = { ...loadEnv(mode, process.cwd()), ...process.env };
  const file = JSON.parse(readFileSync(new URL("./public-config.production.json", import.meta.url), "utf8")) as Record<string, string>;
  const define: Record<string, string> = {};
  for (const key of PUBLIC_KEYS) {
    if (!env[key] && file[key]) define[`import.meta.env.${key}`] = JSON.stringify(file[key]);
  }
  return define;
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  define: productionDefaults(mode),
  server: { port: 5173 },
}));
