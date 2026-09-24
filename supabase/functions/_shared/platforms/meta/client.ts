/**
 * Cliente HTTP mínimo da Graph API (Marketing API) do Meta.
 * - Sempre com HTTPS e com a versão configurada.
 * - Envia appsecret_proof quando META_APP_SECRET está configurado.
 * - Traduz os erros do Meta em AppError com mensagem amigável.
 * - Nunca registra o token em logs.
 */
import { AppError } from "../../http.ts";
import { appSecret, GRAPH_HOST, graphVersion, MAX_PAGES } from "./config.ts";

export interface MetaErrorBody {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    is_transient?: boolean;
    fbtrace_id?: string;
  };
}

/** HMAC-SHA256(token, app_secret) em hexadecimal, como o Meta exige. */
export async function appSecretProof(token: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(token));
  return Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Classifica o erro do Meta (códigos documentados da Graph API).
 * 190/102: token inválido ou expirado · 10 e 200–299: permissão ·
 * 4/17/32/613/80000–80014: limite de uso · demais: indisponível/desconhecido.
 */
export function classifyMetaError(status: number, body: MetaErrorBody): AppError {
  const e = body.error ?? {};
  const code = e.code ?? 0;
  const technical = { httpStatus: status, code, subcode: e.error_subcode, type: e.type, message: e.message, trace: e.fbtrace_id };

  if (code === 190 || code === 102) {
    return new AppError(400, "AUTH_EXPIRED", "O token do Meta é inválido ou expirou. Gere um novo token e conecte novamente.", technical);
  }
  if (code === 10 || (code >= 200 && code <= 299)) {
    return new AppError(403, "PERMISSION_DENIED", "O token do Meta não tem permissão para acessar este recurso. Confira as permissões (ads_read, business_management).", technical);
  }
  if ([4, 17, 32, 613].includes(code) || (code >= 80000 && code <= 80014)) {
    return new AppError(429, "RATE_LIMITED", "O Meta pediu uma pausa nas consultas. Tente novamente em alguns minutos.", technical);
  }
  if (code === 100) {
    return new AppError(400, "PLATFORM_BAD_REQUEST", "O Meta não reconheceu a solicitação (conta inexistente ou sem acesso).", technical);
  }
  return new AppError(502, "PLATFORM_UNAVAILABLE", "Não conseguimos falar com o Meta agora. Tente novamente em instantes.", technical);
}

type Params = Record<string, string>;

async function request(url: URL, token: string, fetchImpl: typeof fetch): Promise<unknown> {
  url.searchParams.set("access_token", token);
  const secret = appSecret();
  if (secret) url.searchParams.set("appsecret_proof", await appSecretProof(token, secret));

  let response: Response;
  try {
    response = await fetchImpl(url, { headers: { Accept: "application/json" } });
  } catch (err) {
    throw new AppError(502, "PLATFORM_UNAVAILABLE", "Não conseguimos falar com o Meta agora. Tente novamente em instantes.", err);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok || (body as MetaErrorBody).error) throw classifyMetaError(response.status, body as MetaErrorBody);
  return body;
}

export function graphUrl(path: string, params: Params = {}): URL {
  const url = new URL(`${GRAPH_HOST}/${graphVersion()}/${path.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url;
}

export async function graphGet<T>(path: string, params: Params, token: string, fetchImpl: typeof fetch = fetch): Promise<T> {
  return (await request(graphUrl(path, params), token, fetchImpl)) as T;
}

/** Percorre todas as páginas de uma lista ("paging.next"). */
export async function graphGetAll<T>(path: string, params: Params, token: string, fetchImpl: typeof fetch = fetch): Promise<T[]> {
  const items: T[] = [];
  let url: URL | null = graphUrl(path, { limit: "100", ...params });
  for (let page = 0; url && page < MAX_PAGES; page++) {
    const body = (await request(url, token, fetchImpl)) as { data?: T[]; paging?: { next?: string } };
    items.push(...(body.data ?? []));
    // O "next" já traz o access_token; removemos para reenviar do nosso jeito.
    if (body.paging?.next) {
      url = new URL(body.paging.next);
      url.searchParams.delete("access_token");
      url.searchParams.delete("appsecret_proof");
    } else {
      url = null;
    }
  }
  return items;
}
