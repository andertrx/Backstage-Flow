import { McpServer } from "npm:@modelcontextprotocol/sdk@1.32.1/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "npm:@modelcontextprotocol/sdk@1.32.1/server/webStandardStreamableHttp.js";
import { AuthError, bearer, oauthClientId } from "./auth.ts";
import { DataError, type DataPort } from "./data.ts";
import { guide } from "./guide.ts";
import { CLIENT_TOOLS, MONITOR_TOOLS } from "./crm_tools.ts";
import { OPS_TOOLS } from "./ops_tools.ts";
import { type Caller, MCP_NAME, MCP_VERSION, READ_TOOLS, ToolError, type ToolSpec } from "./tools.ts";

/**
 * Etapa 40 — servidor MCP do Backstage Flow (SDK oficial, transporte HTTP "streamable", sem sessão).
 * Fluxo: cliente de IA → login (OAuth do Supabase) → papel conferido no banco → limite de chamadas →
 * ferramenta de leitura → consulta existente com o login da pessoa (RLS) → resposta.
 */

export interface LogEntry {
  userId: string | null;
  tool: string;
  ok: boolean;
  errorCode: string | null;
  ms: number;
  oauthClientId: string | null;
}

export interface Deps {
  authenticate(token: string | null): Promise<Caller>;
  /** true = pode seguir; false = passou do limite. */
  rateLimit(userId: string): Promise<boolean>;
  log(entry: LogEntry): Promise<void>;
  reportError(code: string, err: unknown, userId: string | null): Promise<void>;
  dataFor(token: string): DataPort;
  now(): Date;
  timeoutMs: number;
  /** Endereço público deste servidor (identidade do "recurso" no OAuth). */
  resourceUrl: string;
  /** Servidor de login (Supabase Auth). */
  authServerUrl: string;
}

export const MAX_BODY_BYTES = 64 * 1024;
export const RATE_PER_MINUTE = 60;

/** Ferramentas que a pessoa pode usar: leitura + Central (conforme papel e permissões da Central). */
export const toolsFor = (role: Caller["role"], ops: readonly string[]): ToolSpec[] => [...READ_TOOLS, ...OPS_TOOLS, ...MONITOR_TOOLS, ...CLIENT_TOOLS].filter((t) => t.allowed(role, ops));

const INTERNAL_MSG = "Serviço interno do Backstage Flow indisponível no momento. Tente de novo em instantes.";

export function classify(err: unknown): { code: string; message: string; unexpected: boolean } {
  if (err instanceof ToolError) return { code: err.code, message: err.message, unexpected: false };
  if (err instanceof DataError) {
    if (err.dbCode === "42501") return { code: "FORBIDDEN", message: "Sem permissão para essa consulta no Backstage Flow.", unexpected: false };
    if (err.dbCode === "22023") return { code: "INVALID_INPUT", message: err.message, unexpected: false };
    if (err.dbCode === "40001") return { code: "CONFLICT", message: err.message, unexpected: false };
    if (err.dbCode === "23505") return { code: "INVALID_INPUT", message: "Já existe um item com esses dados.", unexpected: false };
    if (err.dbCode === "23514" || err.dbCode === "23502" || err.dbCode === "23503") {
      return { code: "INVALID_INPUT", message: "Valor inválido para este campo (confira IDs, datas e cores).", unexpected: false };
    }
    if (err.dbCode === "22P02" || err.dbCode === "22007" || err.dbCode === "22008") {
      return { code: "INVALID_INPUT", message: "Parâmetro inválido.", unexpected: false };
    }
  }
  return { code: "INTERNAL", message: INTERNAL_MSG, unexpected: true };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const t = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ToolError("TIMEOUT", `Tempo limite excedido (${Math.round(ms / 1000)} s). Tente um período ou filtro menor.`)), ms);
  });
  return Promise.race([p, t]).finally(() => clearTimeout(timer));
}

/** Monta o servidor MCP só com as ferramentas que o papel da pessoa pode usar. */
export function buildServer(
  user: Caller,
  data: DataPort,
  deps: Pick<Deps, "log" | "reportError" | "now" | "timeoutMs">,
  oauthClient: string | null = null,
  ops: readonly string[] = [],
) {
  const server = new McpServer(
    { name: MCP_NAME, title: "Backstage Flow", version: MCP_VERSION },
    {
      instructions:
        "CRM Backstage Flow (agência de tráfego pago). Métricas e campanhas são só leitura. Dá para mexer, com as permissões da pessoa, " +
        "na Central de Operações (tarefas, onboarding dos clientes e, administrador, configurações) e no Monitoramento (tratar alertas, regras). " +
        "Antes de criar ou editar, leia os IDs em backstage_central_reference e a versão no item (get). Respeite as moedas separadas e não invente números. " +
        "Leia o recurso backstage://guia para as regras.",
    },
  );
  const tools = toolsFor(user.role, ops);
  const names = tools.map((t) => t.name);
  for (const t of tools) {
    server.registerTool(
      t.name,
      {
        title: t.title,
        description: t.description,
        inputSchema: t.input,
        annotations: t.write
          ? { readOnlyHint: false, destructiveHint: t.destructive === true, idempotentHint: false, openWorldHint: false }
          : { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      },
      async (args: Record<string, unknown>) => {
        const started = Date.now();
        try {
          const result = await withTimeout(t.run({ user, data, now: deps.now, tools: names, ops }, args ?? {}), deps.timeoutMs);
          await deps.log({ userId: user.id, tool: t.name, ok: true, errorCode: null, ms: Date.now() - started, oauthClientId: oauthClient });
          return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
        } catch (err) {
          const c = classify(err);
          if (c.unexpected) await deps.reportError("MCP_TOOL_FAILED", err, user.id);
          await deps.log({ userId: user.id, tool: t.name, ok: false, errorCode: c.code, ms: Date.now() - started, oauthClientId: oauthClient });
          return { isError: true, content: [{ type: "text" as const, text: c.message }] };
        }
      },
    );
  }
  server.registerResource(
    "guia",
    "backstage://guia",
    { title: "Guia do Backstage Flow (MCP)", description: "Módulos, ferramentas disponíveis para você, regras e limites.", mimeType: "text/markdown" },
    (uri: URL) => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text: guide(user, tools) }] }),
  );
  return server;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, accept, mcp-protocol-version, mcp-session-id, last-event-id",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Expose-Headers": "WWW-Authenticate, mcp-session-id, mcp-protocol-version",
};

function jsonResponse(status: number, body: unknown, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json", ...extra } });
}

/** Erro no formato JSON-RPC (o que o cliente MCP entende), sem detalhe interno. */
const rpcError = (status: number, code: number, message: string, extra: Record<string, string> = {}) =>
  jsonResponse(status, { jsonrpc: "2.0", error: { code, message }, id: null }, extra);

export function createHandler(deps: Deps) {
  const metadataUrl = `${deps.resourceUrl}/.well-known/oauth-protected-resource`;
  const challenge = (desc: string) => ({
    "WWW-Authenticate": `Bearer resource_metadata="${metadataUrl}", error="invalid_token", error_description="${desc.replace(/"/g, "'")}"`,
  });

  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    // Descoberta do login (RFC 9728): diz ao cliente de IA onde fazer o login (Supabase Auth).
    if (req.method === "GET" && url.pathname.endsWith("/.well-known/oauth-protected-resource")) {
      return jsonResponse(200, {
        resource: deps.resourceUrl,
        authorization_servers: [deps.authServerUrl],
        bearer_methods_supported: ["header"],
        resource_name: "Backstage Flow",
      }, { "Cache-Control": "public, max-age=300" });
    }

    // Token nunca pela URL.
    if (/[?&](access_token|token|apikey)=/i.test(url.search)) {
      return rpcError(400, -32600, "Não envie o login pelo endereço. Use o cabeçalho Authorization.");
    }

    const token = bearer(req);
    let user: Caller;
    try {
      user = await deps.authenticate(token);
    } catch (err) {
      if (err instanceof AuthError) {
        return err.status === 401 ? rpcError(401, -32001, err.message, challenge(err.message)) : rpcError(403, -32003, err.message);
      }
      await deps.reportError("MCP_AUTH_FAILED", err, null);
      return rpcError(503, -32603, INTERNAL_MSG);
    }
    const client = oauthClientId(token!);

    if (req.method !== "POST") return rpcError(405, -32000, "Método não permitido. Este servidor usa só POST (sem sessão).", { Allow: "POST, OPTIONS" });

    if (!(await deps.rateLimit(user.id))) {
      await deps.log({ userId: user.id, tool: "(limite)", ok: false, errorCode: "TOO_MANY_REQUESTS", ms: 0, oauthClientId: client });
      return rpcError(429, -32029, `Muitas chamadas seguidas (máximo ${RATE_PER_MINUTE} por minuto). Aguarde um minuto.`, { "Retry-After": "60" });
    }

    const length = Number(req.headers.get("content-length") ?? "0");
    if (length > MAX_BODY_BYTES) return rpcError(413, -32600, "Pedido grande demais.");

    const data = deps.dataFor(token!);
    const ops = await data.opsPermissions().catch(() => [] as string[]);
    const server = buildServer(user, data, deps, client, ops);
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    try {
      await server.connect(transport);
      const res = await transport.handleRequest(req);
      const headers = new Headers(res.headers);
      for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
      return new Response(res.body, { status: res.status, headers });
    } catch (err) {
      await deps.reportError("MCP_TRANSPORT_FAILED", err, user.id);
      return rpcError(500, -32603, INTERNAL_MSG);
    }
  };
}
