import { createClient } from "npm:@supabase/supabase-js@2";
import { adminClient } from "../_shared/auth.ts";
import { recordError } from "../_shared/errorlog.ts";
import { authenticate } from "./auth.ts";
import { supabaseData } from "./data.ts";
import { createHandler, RATE_PER_MINUTE } from "./server.ts";

/**
 * Etapa 40 — Edge Function "mcp": servidor MCP remoto do Backstage Flow (leitura; escrita só na Central de Operações, 40.2).
 * Endereço público: https://www.backstageflow.com.br/mcp (o site repassa para https://<projeto>.supabase.co/functions/v1/mcp).
 * O endereço é o do site porque o Supabase tira o cabeçalho WWW-Authenticate das respostas: o cliente de IA então
 * acha o login pelo arquivo /.well-known/oauth-protected-resource/mcp, que o site publica (apps/web/public/.well-known).
 * verify_jwt desligado: o login é conferido aqui.
 * A chave de serviço é usada SÓ para conferir o login, contar o limite e gravar o registro; os dados
 * são lidos com o login da própria pessoa.
 */
const URL_BASE = Deno.env.get("SUPABASE_URL")!;
const admin = adminClient();

Deno.serve(createHandler({
  authenticate: (token) => authenticate(token, admin),
  async rateLimit(userId) {
    const { data, error } = await admin.rpc("rate_limit_hit", { p_bucket: "mcp.call", p_subject: userId, p_max: RATE_PER_MINUTE, p_window_seconds: 60 });
    if (error) {
      await recordError({ source: "servidor", code: "RATE_LIMIT_CHECK_FAILED", technical: error, context: { acao: "mcp.call" }, userId });
      return true;
    }
    return data !== false;
  },
  async log(e) {
    const { error } = await admin.rpc("mcp_log_call", {
      p_user: e.userId, p_tool: e.tool, p_ok: e.ok, p_error: e.errorCode, p_ms: e.ms, p_client: e.oauthClientId,
    });
    if (error) console.error("mcp: registro da chamada falhou", error.code);
  },
  async reportError(code, err, userId) {
    await recordError({ source: "servidor", code, technical: err, context: { funcao: "mcp" }, userId });
  },
  dataFor: (token) =>
    supabaseData(createClient(URL_BASE, Deno.env.get("SUPABASE_ANON_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    })),
  now: () => new Date(),
  timeoutMs: 20_000,
  resourceUrl: Deno.env.get("MCP_PUBLIC_URL") ?? "https://www.backstageflow.com.br/mcp",
  authServerUrl: `${URL_BASE}/auth/v1`,
}));
