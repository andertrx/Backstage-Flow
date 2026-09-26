import { EXPECTED_CODES, recordError } from "./errorlog.ts";

/**
 * Utilidades HTTP comuns às Edge Functions: CORS, respostas JSON e erros amigáveis.
 */

/** Erro com mensagem AMIGÁVEL para o usuário. O detalhe técnico vai só para o log. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly userMessage: string,
    public readonly technical?: unknown,
  ) {
    super(userMessage);
  }
}

/**
 * Sites que podem chamar as funções pelo navegador (Etapa 26): o site oficial,
 * as versões de teste da Vercel deste projeto e o computador de desenvolvimento.
 * Para um domínio próprio, somar em ALLOWED_ORIGINS (separados por vírgula).
 */
const DEFAULT_ORIGINS: (string | RegExp)[] = [
  "https://web-ivory-three-49.vercel.app",
  /^https:\/\/web-[a-z0-9-]+-andertrxs-projects\.vercel\.app$/,
  /^http:\/\/localhost:(5173|4173)$/,
];

export function isAllowedOrigin(origin: string, extra: string | undefined = Deno.env.get("ALLOWED_ORIGINS")): boolean {
  if (!origin) return false;
  const configured = (extra ?? "").split(",").map((o) => o.trim()).filter(Boolean);
  return configured.includes(origin) || DEFAULT_ORIGINS.some((o) => (typeof o === "string" ? o === origin : o.test(origin)));
}

function allowedOrigin(req: Request): string {
  const origin = req.headers.get("origin") ?? "";
  return isAllowedOrigin(origin) ? origin : (DEFAULT_ORIGINS[0] as string);
}

export function corsHeaders(req: Request): HeadersInit {
  return {
    "Access-Control-Allow-Origin": allowedOrigin(req),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

export function json(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

/**
 * Envolve o handler: responde ao preflight CORS, aceita só POST e transforma
 * qualquer erro em resposta amigável. O detalhe técnico (sem segredos) fica
 * guardado em error_logs para o administrador (Etapa 25).
 */
export function handle(fn: (req: Request) => Promise<Response>, name = "funcao") {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
    if (req.method !== "POST") {
      return json(req, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "Método não permitido." } });
    }
    try {
      return await fn(req);
    } catch (err) {
      if (err instanceof AppError) {
        // Erros "esperados" (ex.: sessão expirada, campo inválido) não poluem o log.
        if (!EXPECTED_CODES.has(err.code)) {
          await recordError({ source: "servidor", code: err.code, userMessage: err.userMessage, technical: err.technical ?? err, context: { funcao: name } });
        }
        return json(req, err.status, { error: { code: err.code, message: err.userMessage } });
      }
      const message = "Algo deu errado. Tente novamente em instantes.";
      await recordError({ source: "servidor", code: "UNKNOWN", userMessage: message, technical: err, context: { funcao: name } });
      return json(req, 500, { error: { code: "UNKNOWN", message } });
    }
  };
}
